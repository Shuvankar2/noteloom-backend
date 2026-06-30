const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer'); 

// --- IMPORTS ---
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

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';

// ==========================================
// EMAIL CONFIGURATION (Nodemailer)
// ==========================================

// Create reusable transporter object using the default SMTP transport
const createEmailTransport = () => {
  return nodemailer.createTransport({
    service: 'gmail', 
    auth: {
      user: process.env.EMAIL_USER, // Ensure these are set in your .env file
      pass: process.env.EMAIL_PASS
    }
  });
};

const sendEmail = async (email, code) => {
  try {
    const transport = createEmailTransport();
    
    const mailOptions = {
      from: `"Note Loom" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: `Note Loom - Sign Up Email Verification Code`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; }
            .verification-code { font-size: 32px; font-weight: bold; color: #667eea; text-align: center; padding: 20px; background: white; border-radius: 10px; margin: 20px 0; letter-spacing: 5px; }
            .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
            .warning { background: #fff3cd; border: 1px solid #ffeeba; color: #856404; padding: 15px; border-radius: 5px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎓 Note Loom</h1>
              <p>Exams Made Simple</p>
            </div>
            <div class="content">
              <h2>Sign Up - Email Verification Required</h2>
              <p>Hello!</p>
              <p>Thank you for signing up with Note Loom. To complete your registration, please use the verification code below:</p>
              
              <div class="verification-code">${code}</div>
              
              <p><strong>This code will expire in 10 minutes.</strong></p>
              
              <div class="warning">
                <strong>⚠️ Security Notice:</strong>
                <ul>
                  <li>Never share this code with anyone</li>
                  <li>If you didn't request this code, please ignore this email</li>
                </ul>
              </div>
              
              <p>Best regards,<br><strong>The Note Loom Team</strong></p>
            </div>
            <div class="footer">
              <p>© 2025 Note Loom. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    await transport.sendMail(mailOptions);
    console.log(`✅ Email sent successfully to: ${email}`);
    return true;

  } catch (error) {
    console.error('❌ Email sending failed:', error);
    throw new Error('Failed to send verification email');
  }
};

// ==========================================
// PUBLIC ROUTES
// ==========================================

// --- 1. CHECK EMAIL ---
router.post('/check-email', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });

    const user = await User.findOne({ email });
    
    if (user) {
      // Return details so Frontend can show "Already registered at [CollegeName]"
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
});

// --- 2. SEND VERIFICATION ---
router.post('/send-verification', async (req, res) => {
  try {
    const { email, type = 'signup' } = req.body;
    
    // 1. Generate Code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // 2. Clean up old codes
    await EmailVerification.deleteMany({ email, type });

    // 3. Save to DB
    await EmailVerification.create({ email, code, type, expiresAt });

    // 4. Send Email (Real Logic)
    await sendEmail(email, code);

    res.json({ message: 'Verification code sent successfully' });
  } catch (error) {
    console.error('Send verification error:', error);
    res.status(500).json({ error: 'Failed to send verification code' });
  }
});

// --- 3. VERIFY EMAIL ---
router.post('/verify-email', async (req, res) => {
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
});

// --- 4. SIGNUP (Strict Code-Based Logic) ---
// --- 4. SIGNUP (Fixed: Saves Profile Data & Uses Admin 900 Logic) ---
router.post('/role-signup', async (req, res) => {
  try {
    // 1. EXTRACT ALL DATA
    const { 
      email, fullName, password, collegeCode, role = 'student',
      // Student Fields (These were being ignored before!)
      phoneNumber, gender, admissionYear, course, stream, year, rollNo, currentSemester,
      // Faculty Fields
      department, designation, qualification, experience, specialization, employeeId,
      // Admin Fields
      adminLevel, responsibilities, approvalAuthority, accessLevel
    } = req.body;

    // 2. Check Existing User
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'User already registered' });
    }

    // 3. Find Tenant
    let tenant = await Tenant.findOne({ collegeCode: collegeCode });
    if (!tenant) {
      return res.status(404).json({ error: 'Institution code not found' });
    }

    // 4. Create User
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ email, name: fullName, password: hashedPassword, emailVerified: true });
    await user.save();

    // 5. Create Membership
    const membership = new Membership({ userId: user._id, tenantId: tenant._id, role: role });
    await membership.save();

    // --- 6. GENERATE UID (Admin: 900, Others: Year) ---
    let middleCode = '';
    // Count ONLY users in this college with this specific role
    let countQuery = { tenantId: tenant._id, role: role };
    
    if (role === 'college_admin') {
      // Fixed at 900 for now as requested. Will be variable later.
      middleCode = '900'; 
    } else {
      middleCode = new Date().getFullYear().toString(); // e.g., "2026"
    }

    const roleMemberCount = await Membership.countDocuments(countQuery);
    const sequence = roleMemberCount.toString().padStart(5, '0');
    const generatedUid = `${tenant.collegeCode}${middleCode}${sequence}`;

    // 7. Create Profile (PASS THE DATA HERE!)
    if (role === 'student') {
      await StudentProfile.create({
        userId: user._id, tenantId: tenant._id, uid: generatedUid,
        name: fullName, email,
        // ✅ PASS THE FIELDS BELOW TO PREVENT 'rollNo: null' ERROR
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
    // Handle duplicate key errors gracefully
    if (error.code === 11000) {
      return res.status(400).json({ error: 'A user with this ID or Roll Number already exists.' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- 5. SIGNIN (Handles College Mismatch via Code) ---
router.post('/signin', async (req, res) => {
  try {
    const { email, password, collegeCode } = req.body; 
    
    // 1. Verify Credentials
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(401).json({ error: 'Invalid credentials' });

    // 2. Locate Tenant by Code
    const requestedTenant = await Tenant.findOne({ collegeCode });
    if (!requestedTenant) return res.status(404).json({ error: 'Institution code not recognized' });

    // 3. Strict Membership Check
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

    // 4. JWT Creation
    const sessionToken = jwt.sign(
      { userId: user._id, tenantId: requestedTenant._id, collegeCode: requestedTenant.collegeCode },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // 5. ✅ CREATE SESSION IN DB (Crucial for sessionRoutes.js to work)
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    await Session.create({
      userId: user._id,
      tenantId: requestedTenant._id,
      sessionToken,
      expiresAt
    });

    // 6. ✅ SEND SUCCESS RESPONSE
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
});

// --- 6. SIGNOUT ---
router.post('/signout', async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (token) await Session.findOneAndDelete({ sessionToken: token });
    res.json({ message: 'Signed out successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Signout failed' });
  }
});

// --- 7. VERIFY TOKEN ---
router.get('/verify-token', async (req, res) => {
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
});

// ==========================================
// 8. GET ALL ACTIVE COLLEGES (For Selection Page)
// ==========================================
// ✅ PUBLIC: Colleges for selection screen
router.get('/public/colleges', async (req, res) => {
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
});


module.exports = router;