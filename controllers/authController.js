const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User'); 
const StudentProfile = require('../models/StudentProfile');
const FacultyProfile = require('../models/FacultyProfile');
const AdminProfile = require('../models/AdminProfile');
const ITUserProfile = require('../models/ITUserProfile'); 
const ITAdminProfile = require('../models/ITAdminProfile'); 
const Tenant = require('../models/Tenant'); 
const Membership = require('../models/Membership'); 
const Session = require('../models/Session'); 
const EmailVerification = require('../models/EmailVerification'); 
const { sendEmail } = require('../services/emailService');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET environment variable is not set.');
}

// 1. CHECK EMAIL
exports.checkEmail = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });

    const user = await User.findOne({ email });
    
    if (user) {
      const membership = await Membership.findOne({ userId: user._id }).populate('tenantId');
      return res.json({ 
        exists: true,
        collegeName: membership?.tenantId?.name || 'Unknown College',
        role: membership?.role
      });
    }
    res.json({ exists: false });
  } catch (error) {
    console.error("Check email error:", error);
    res.status(500).json({ error: "Server error" });
  }
};

// 2. SEND VERIFICATION
exports.sendVerification = async (req, res) => {
  try {
    const { email, type = 'signup' } = req.body;
    
    // Generate Code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Clean up old codes
    await EmailVerification.deleteMany({ email, type });

    // Save to DB
    await EmailVerification.create({ email, code, type, expiresAt });

    // Send Email via service
    await sendEmail(email, code);

    res.json({ message: 'Verification code sent successfully' });
  } catch (error) {
    console.error('Send verification error:', error);
    res.status(500).json({ error: 'Failed to send verification code' });
  }
};

// 3. VERIFY EMAIL
exports.verifyEmail = async (req, res) => {
  try {
    const { email, code, type = 'signup' } = req.body;
    const record = await EmailVerification.findOne({
      email, code, type, isUsed: false, expiresAt: { $gt: new Date() }
    });

    if (!record) return res.status(400).json({ message: 'Invalid or expired code' });

    record.isUsed = true;
    await record.save();
    res.json({ message: 'Email verified successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Verification failed' });
  }
};

// 4. SIGNUP (Strict Code-Based Logic)
exports.roleSignup = async (req, res) => {
  try {
    const { 
      email, fullName, password, collegeCode, role = 'student',
      phoneNumber, gender, admissionYear, course, stream, year, rollNo, currentSemester,
      department, designation, qualification, experience, specialization, employeeId,
      adminLevel, responsibilities, approvalAuthority, accessLevel
    } = req.body;

    // Check Existing User
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'User already registered' });
    }

    // Find Tenant
    let tenant = await Tenant.findOne({ collegeCode: collegeCode });
    if (!tenant) {
      return res.status(404).json({ error: 'Institution code not found' });
    }

    // Create User
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ email, name: fullName, password: hashedPassword, emailVerified: true });
    await user.save();

    // Create Membership
    const membership = new Membership({ userId: user._id, tenantId: tenant._id, role: role });
    await membership.save();

    // Generate UID
    let middleCode = '';
    let countQuery = { tenantId: tenant._id, role: role };
    
    if (role === 'college_admin') {
      middleCode = '900'; 
    } else {
      middleCode = new Date().getFullYear().toString(); 
    }

    const roleMemberCount = await Membership.countDocuments(countQuery);
    const sequence = roleMemberCount.toString().padStart(5, '0');
    const generatedUid = `${tenant.collegeCode}${middleCode}${sequence}`;

    // Create Profile
    if (role === 'student') {
      await StudentProfile.create({
        userId: user._id, tenantId: tenant._id, uid: generatedUid,
        name: fullName, email,
        phoneNumber, gender, admissionYear, course, stream, year, rollNo, currentSemester
      });
    } else if (role === 'faculty') {
      await FacultyProfile.create({
        userId: user._id, tenantId: tenant._id, uid: generatedUid,
        name: fullName, email,
        department, designation, qualification, experience, specialization, employeeId
      });
    } else if (role === 'college_admin') {
      await AdminProfile.create({
        userId: user._id, tenantId: tenant._id, uid: generatedUid,
        name: fullName, email,
        adminLevel, responsibilities, employeeId,
        approvalAuthority: approvalAuthority || 'None',
        accessLevel: accessLevel || 'Standard'
      });
    }

    res.json({ message: 'User created successfully', uid: generatedUid });

  } catch (error) {
    console.error('Signup error:', error);
    if (error.code === 11000) {
      return res.status(400).json({ error: 'A user with this ID or Roll Number already exists.' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};

// 5. SIGNIN
exports.signin = async (req, res) => {
  try {
    const { email, password, collegeCode } = req.body; 
    
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(401).json({ error: 'Invalid credentials' });

    const requestedTenant = await Tenant.findOne({ collegeCode });
    if (!requestedTenant) return res.status(404).json({ error: 'Institution code not recognized' });

    const membership = await Membership.findOne({ 
      userId: user._id, 
      tenantId: requestedTenant._id,
      status: 'active' 
    }).populate('tenantId');

    if (!membership) {
      const actualMembership = await Membership.findOne({ userId: user._id }).populate('tenantId');
      return res.status(403).json({ 
        error: 'college_mismatch', 
        userCollegeName: actualMembership?.tenantId.name || 'another institution'
      });
    }

    const sessionToken = jwt.sign(
      { userId: user._id, tenantId: requestedTenant._id, collegeCode: requestedTenant.collegeCode },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    await Session.create({
      userId: user._id,
      tenantId: requestedTenant._id,
      sessionToken,
      expiresAt
    });

    res.json({
      message: 'Login successful',
      sessionToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email
      }
    });

  } catch (error) {
    console.error("Signin Error:", error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// 6. SIGNOUT
exports.signout = async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (token) await Session.findOneAndDelete({ sessionToken: token });
    res.json({ message: 'Signed out successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Signout failed' });
  }
};

// 7. VERIFY TOKEN
exports.verifyToken = async (req, res) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// 8. GET PUBLIC COLLEGES
exports.getPublicColleges = async (req, res) => {
  try {
    const colleges = await Tenant.find({
      type: 'college',
      status: 'active',
      name: { $ne: 'Note Loom System' }
    }).sort({ name: 1 });

    res.json(colleges);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch colleges' });
  }
};
