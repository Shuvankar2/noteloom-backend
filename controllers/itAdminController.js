const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Models
const User = require('../models/User');
const Tenant = require('../models/Tenant');
const Session = require('../models/Session');
const Membership = require('../models/Membership');
const ITUserProfile = require('../models/ITUserProfile');
const CollegeAdminRequest = require('../models/CollegeAdminRequest');
const SystemConfig = require('../models/SystemConfig');
const NoteloomManagerRequest = require('../models/NoteloomManagerRequest');
const masterFeatures = require('../config/masterFeatures');

const JWT_SECRET = process.env.JWT_SECRET;

// Helper to calculate the next incremental college code
const getNextCollegeCode = async () => {
  const lastTenant = await Tenant.findOne({ type: 'college' })
    .sort({ collegeCode: -1 }) // Sort descending to get the highest number
    .select('collegeCode');

  if (!lastTenant || !lastTenant.collegeCode) {
    return "1001"; // Starting point for the first college
  }

  const nextNumber = parseInt(lastTenant.collegeCode) + 1;
  return nextNumber.toString();
};

// ==========================================
// PUBLIC CONTROLLER ACTIONS
// ==========================================

exports.getPublicColleges = async (req, res) => {
  try {
    const colleges = await Tenant.find({
      type: 'college',
      status: 'active',
      name: { $ne: 'Note Loom System' }
    }).sort({ name: 1 });

    res.json(colleges);
  } catch (error) {
    console.error('Public colleges fetch failed:', error);
    res.status(500).json({ error: 'Failed to fetch colleges' });
  }
};

// ==========================================
// AUTHENTICATION
// ==========================================

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check Credentials
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check Membership (Strict IT Check)
    const membership = await Membership.findOne({
      userId: user._id,
      role: { $in: ['it_admin', 'it_user'] },
      status: 'active'
    }).populate('tenantId');

    if (!membership) {
      return res.status(403).json({ error: 'Access denied. Not an IT account.' });
    }

    // Normalize Role for Frontend
    let frontendRole = membership.role;
    if (membership.role === 'it_admin') frontendRole = 'noteloom_admin';
    if (membership.role === 'it_user')  frontendRole = 'noteloom_manager';

    // Create Session
    const sessionToken = jwt.sign(
      { userId: user._id, role: membership.role }, 
      JWT_SECRET, 
      { expiresIn: '12h' }
    );

    await Session.create({
      userId: user._id,
      tenantId: membership.tenantId._id,
      sessionToken,
      expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000)
    });

    res.json({
      sessionToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: frontendRole
      }
    });

  } catch (error) {
    console.error('IT Login Error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.signout = async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (token) {
      await Session.findOneAndDelete({ sessionToken: token });
    }
    res.json({ success: true, message: 'Signed out successfully' });
  } catch (error) {
    console.error('Signout Error:', error);
    res.status(500).json({ error: 'Server error during signout' });
  }
};

// ==========================================
// COLLEGE MANAGEMENT
// ==========================================

exports.getColleges = async (req, res) => {
  try {
    const colleges = await Tenant.find({ 
      type: 'college',
      name: { $ne: 'Note Loom System' }
    }).sort({ createdAt: -1 });
    res.json(colleges);
  } catch (error) { res.status(500).json({ error: 'Fetch failed' }); }
};

exports.createCollege = async (req, res) => {
  try {
    if (req.itUser.role !== 'noteloom_admin') {
      return res.status(403).json({ error: 'Access Denied: Only Admin can create colleges.' });
    }

    const { name, logoUrl, location, category, featured, adminName, adminEmail, adminPassword } = req.body;
    
    const subdomain = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const collegeCode = await getNextCollegeCode();
    
    const newCollege = await Tenant.create({
      name, 
      type: 'college', 
      subdomain, 
      logoUrl,
      location: location || 'India',
      category: category || 'University',
      featured: typeof featured === 'boolean' ? featured : false,
      collegeCode,
      status: 'active'
    });

    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    const newAdmin = await User.create({
      name: adminName, 
      email: adminEmail, 
      password: hashedPassword, 
      role: 'college_admin'
    });

    await Membership.create({
      userId: newAdmin._id, 
      tenantId: newCollege._id, 
      role: 'college_admin'
    });

    res.json(newCollege);
  } catch (error) {
    console.error("Creation Error:", error);
    res.status(500).json({ error: 'Failed to create college' });
  }
};

exports.updateCollegeStatus = async (req, res) => {
  try {
    const tenant = await Tenant.findById(req.params.id);
    if (tenant.name === 'Note Loom System') return res.status(403).json({ error: 'Protected' });

    tenant.status = req.body.status;
    if (req.body.status === 'active') tenant.deletionScheduledAt = null;
    await tenant.save();
    
    res.json(tenant);
  } catch (error) { res.status(500).json({ error: 'Update failed' }); }
};

exports.deleteCollege = async (req, res) => {
  try {
    if (req.itUser.role !== 'noteloom_admin') {
      return res.status(403).json({ error: 'Access Denied: Only Admin can delete colleges.' });
    }

    const tenant = await Tenant.findById(req.params.id);
    if (tenant.name === 'Note Loom System') return res.status(403).json({ error: 'Protected' });

    tenant.status = 'suspended';
    tenant.deletionScheduledAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    await tenant.save();

    res.json({ message: 'College scheduled for deletion' });
  } catch (error) { res.status(500).json({ error: 'Delete failed' }); }
};

// ==========================================
// REQUESTS & USERS
// ==========================================

exports.getCollegeRequests = async (req, res) => {
  try {
    const requests = await CollegeAdminRequest.find().sort({ createdAt: -1 });
    res.json(requests);
  } catch (e) { res.status(500).json({ error: 'Error' }); }
};

exports.getManagerRequests = async (req, res) => {
  try {
    if (req.itUser.role !== 'noteloom_admin') return res.status(403).json({ error: 'Access Denied' });
    const requests = await NoteloomManagerRequest.find().sort({ createdAt: -1 });
    res.json(requests);
  } catch (e) { res.status(500).json({ error: 'Error' }); }
};

exports.getUsers = async (req, res) => {
  try {
    if (req.itUser.role !== 'noteloom_admin') return res.status(403).json({ error: 'Access Denied' });

    const profiles = await ITUserProfile.find().populate('userId', 'name email role');
    const users = profiles.map(p => ({
      _id: p.userId?._id,
      name: p.userId?.name || 'Unknown',
      email: p.userId?.email || 'No Email',
      role: p.userId?.role === 'it_admin' ? 'noteloom_admin' : 'noteloom_manager',
      uid: p.uid
    }));

    res.json(users);
  } catch (error) { res.status(500).json({ error: 'Fetch failed' }); }
};

exports.getTenantsList = async (req, res) => {
  try {
    const tenants = await Tenant.find({ 
      status: { $ne: 'deleted' },
      name: { $ne: 'Note Loom System' }
    }, '_id name type status logoUrl').sort({ name: 1 });

    res.json(tenants);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch tenants' });
  }
};

// ==========================================
// FEATURE CONFIG
// ==========================================

exports.getMenuConfig = async (req, res) => {
  if (!masterFeatures || Object.keys(masterFeatures).length === 0) {
    console.error("❌ CRITICAL: masterFeatures is empty! Check backend/config/masterFeatures.js");
    return res.json({
      student: [{ key: 'error', title: 'Error: Master List Not Found', isActive: true }],
      faculty: [],
      college_admin: []
    });
  }

  try {
    const savedDoc = await SystemConfig.findOne({ tenantId: req.params.tenantId });
    const savedConfig = (savedDoc && savedDoc.config) ? savedDoc.config : {};
    const response = {};

    ['student', 'faculty', 'college_admin'].forEach(role => {
      const masterList = masterFeatures[role] || [];
      
      response[role] = masterList.map(item => {
        const roleConfig = savedConfig[role] || [];
        const savedItem = roleConfig.find(s => s.key === item.key);
        
        return {
          ...item,
          isActive: savedItem ? savedItem.isActive : true 
        };
      });
    });

    res.json(response);

  } catch (error) {
    console.error('Menu config fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch config: ' + error.message });
  }
};

exports.saveMenuConfig = async (req, res) => {
  try {
    if (req.itUser.role !== 'noteloom_admin') {
      return res.status(403).json({ error: 'Only Admin can change features.' });
    }

    const { tenantId, role, tabs } = req.body; 

    const simplifiedTabs = tabs.map(t => ({
      key: t.key,
      isActive: t.isActive
    }));

    const config = await SystemConfig.findOne({ tenantId });

    if (config) {
      config.config[role] = simplifiedTabs;
      config.updatedAt = new Date();
      config.updatedBy = req.itUser.id;
      await config.save();
    } else {
      const newConfig = {
        tenantId,
        config: { student: [], faculty: [], college_admin: [] },
        updatedBy: req.itUser.id
      };
      newConfig.config[role] = simplifiedTabs;
      await SystemConfig.create(newConfig);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Save config error:', error);
    res.status(500).json({ error: 'Failed to save configuration' });
  }
};

// ==========================================
// UPDATE COLLEGE DETAILS
// ==========================================

exports.updateCollege = async (req, res) => {
  try {
    const { name, logoUrl, location, category, featured } = req.body;
    
    const updatedTenant = await Tenant.findByIdAndUpdate(
      req.params.id,
      {
        name,
        logoUrl,
        location: location || 'India',
        category: category || 'University',
        featured: typeof featured === 'boolean' ? featured : false
      },
      { new: true, runValidators: true }
    );

    if (!updatedTenant) return res.status(404).json({ error: 'College not found' });
    
    res.json(updatedTenant);
  } catch (error) {
    console.error('Update College Error:', error);
    res.status(500).json({ error: 'Failed to update college details' });
  }
};
