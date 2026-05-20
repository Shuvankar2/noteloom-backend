const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Models
const User = require('../models/User');
const Tenant = require('../models/Tenant');
const Session = require('../models/Session');
const Membership = require('../models/Membership');
const ITUserProfile = require('../models/ITUserProfile');
const ITAdminProfile = require('../models/ITAdminProfile');
const CollegeAdminRequest = require('../models/CollegeAdminRequest');
const SystemConfig = require('../models/SystemConfig');
const NoteloomManagerRequest = require('../models/NoteloomManagerRequest');
const masterFeatures = require('../config/masterFeatures');

// Middleware
const { setITContext } = require('../middleware/authMiddleware');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';

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
// PUBLIC ROUTES (NO AUTH)
// ==========================================

router.get('/public/colleges', async (req, res) => {
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
});


// ==========================================
// 1. AUTHENTICATION
// ==========================================

// ✅ FIXED: Changed '/signin' to '/login' to match your frontend request
// URL becomes: /it-admin/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // A. Check Credentials
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // B. Check Membership (Strict IT Check)
    const membership = await Membership.findOne({
      userId: user._id,
      role: { $in: ['it_admin', 'it_user'] },
      status: 'active'
    }).populate('tenantId');

    if (!membership) {
      return res.status(403).json({ error: 'Access denied. Not an IT account.' });
    }

    // C. Normalize Role for Frontend
    let frontendRole = membership.role;
    if (membership.role === 'it_admin') frontendRole = 'noteloom_admin';
    if (membership.role === 'it_user')  frontendRole = 'noteloom_manager';

    // D. Create Session
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

    // E. Return Response
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
});

// ==========================================
// 2. COLLEGE MANAGEMENT
// ==========================================

// GET: View Colleges
router.get('/colleges', setITContext, async (req, res) => {
  try {
    const colleges = await Tenant.find({ 
      type: 'college',
      name: { $ne: 'Note Loom System' } // ✅ Filter out System Tenant
    }).sort({ createdAt: -1 });
    res.json(colleges);
  } catch (error) { res.status(500).json({ error: 'Fetch failed' }); }
});

// POST: Create College (Admin Only)
router.post('/colleges', setITContext, async (req, res) => {
  try {
    if (req.itUser.role !== 'noteloom_admin') {
      return res.status(403).json({ error: 'Access Denied: Only Admin can create colleges.' });
    }

    const { name, logoUrl, location, category, featured, adminName, adminEmail, adminPassword } = req.body;
    
    const subdomain = name.toLowerCase().replace(/[^a-z0-9]/g, '-');

    // 1. GENERATE INCREMENTAL CODE (Replaces random Math.floor)
    const collegeCode = await getNextCollegeCode();
    
    const newCollege = await Tenant.create({
      name, 
      type: 'college', 
      subdomain, 
      logoUrl,
      location: location || 'India',
      category: category || 'University',
      featured: typeof featured === 'boolean' ? featured : false,
      collegeCode, // ✅ Now uses incremental 1001, 1002, etc.
      status: 'active'
    });

    // Admin user creation remains the same
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
});

// PATCH: Toggle Status
router.patch('/colleges/:id/status', setITContext, async (req, res) => {
  try {
    const tenant = await Tenant.findById(req.params.id);
    if (tenant.name === 'Note Loom System') return res.status(403).json({ error: 'Protected' });

    tenant.status = req.body.status;
    if (req.body.status === 'active') tenant.deletionScheduledAt = null;
    await tenant.save();
    
    res.json(tenant);
  } catch (error) { res.status(500).json({ error: 'Update failed' }); }
});

// DELETE: Remove College (Admin Only)
router.delete('/colleges/:id', setITContext, async (req, res) => {
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
});

// ==========================================
// 3. REQUESTS & USERS
// ==========================================

router.get('/college-requests', setITContext, async (req, res) => {
  try {
    const requests = await CollegeAdminRequest.find().sort({ createdAt: -1 });
    res.json(requests);
  } catch (e) { res.status(500).json({ error: 'Error' }); }
});

router.get('/manager-requests', setITContext, async (req, res) => {
  try {
    if (req.itUser.role !== 'noteloom_admin') return res.status(403).json({ error: 'Access Denied' });
    const requests = await NoteloomManagerRequest.find().sort({ createdAt: -1 });
    res.json(requests);
  } catch (e) { res.status(500).json({ error: 'Error' }); }
});

router.get('/users', setITContext, async (req, res) => {
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
});

// ==========================================
// 6. TENANTS LIST (Required for Feature Manager)
// ==========================================
// GET: Tenants List (For Dropdown)
router.get('/tenants-list', setITContext, async (req, res) => {
  try {
    const tenants = await Tenant.find({ 
      status: { $ne: 'deleted' },
      name: { $ne: 'Note Loom System' } // ✅ Filter out System Tenant
    }, '_id name type status logoUrl').sort({ name: 1 });

    res.json(tenants);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch tenants' });
  }
});

// ==========================================
// 7. SIGNOUT (Add this missing route)
// ==========================================
router.post('/signout', async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (token) {
      // Remove the session from the database
      await Session.findOneAndDelete({ sessionToken: token });
    }
    res.json({ success: true, message: 'Signed out successfully' });
  } catch (error) {
    console.error('Signout Error:', error);
    res.status(500).json({ error: 'Server error during signout' });
  }
});

module.exports = router;

// ==========================================
// 4. NEW: FEATURE CONFIG (The Fix for Empty Screen)
// ==========================================

// GET: Merge Master List with Saved Config (DEBUG VERSION)
router.get('/menu-config/:tenantId', setITContext, async (req, res) => {
  console.log("--- 🔍 DEBUG: Fetching Menu Config ---");
  console.log("1. Tenant ID:", req.params.tenantId);
  
  // Check if Master Features are loaded
  if (!masterFeatures || Object.keys(masterFeatures).length === 0) {
    console.error("❌ CRITICAL: masterFeatures is empty! Check backend/config/masterFeatures.js");
    // Fallback data to prove the UI works
    return res.json({
      student: [{ key: 'error', title: 'Error: Master List Not Found', isActive: true }],
      faculty: [],
      college_admin: []
    });
  }
  console.log("2. Master Features Loaded:", Object.keys(masterFeatures));

  try {
    // 1. Fetch Saved Config from DB
    const savedDoc = await SystemConfig.findOne({ tenantId: req.params.tenantId });
    console.log("3. DB Config Found:", savedDoc ? "Yes" : "No");

    // Safety check: Ensure config object exists
    const savedConfig = (savedDoc && savedDoc.config) ? savedDoc.config : {};

    // 2. Merge Master List with Saved Status
    const response = {};

    ['student', 'faculty', 'college_admin'].forEach(role => {
      const masterList = masterFeatures[role] || [];
      
      response[role] = masterList.map(item => {
        // Safe check for saved config array
        const roleConfig = savedConfig[role] || [];
        const savedItem = roleConfig.find(s => s.key === item.key);
        
        return {
          ...item,
          isActive: savedItem ? savedItem.isActive : true 
        };
      });
    });

    console.log("4. Sending Response with Student items:", response.student?.length);
    res.json(response);

  } catch (error) {
    console.error("❌ SERVER ERROR:", error);
    res.status(500).json({ error: 'Failed to fetch config: ' + error.message });
  }
});

// POST: Save Configuration
router.post('/menu-config', setITContext, async (req, res) => {
  try {
    // Permission Check
    if (req.itUser.role !== 'noteloom_admin') {
      return res.status(403).json({ error: 'Only Admin can change features.' });
    }

    const { tenantId, role, tabs } = req.body; 

    // 1. Simplify data for storage
    const simplifiedTabs = tabs.map(t => ({
      key: t.key,
      isActive: t.isActive
    }));

    // 2. Update or Insert
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
});


// ==========================================
// 5. UPDATE COLLEGE DETAILS (NEW ROUTE)
// ==========================================
// PUT: Update College Details (Admin & Manager)
router.put('/colleges/:id', setITContext, async (req, res) => {
  try {
    const { name, logoUrl, location, category, featured } = req.body;
    
    // We only allow updating display-specific fields to maintain system integrity
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
});

module.exports = router;