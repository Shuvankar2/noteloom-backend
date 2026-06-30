const express = require('express');
const router = express.Router();
const Session = require('../models/Session');
const Membership = require('../models/Membership');
const StudentProfile = require('../models/StudentProfile');
const FacultyProfile = require('../models/FacultyProfile');
const AdminProfile = require('../models/AdminProfile');
const ITUserProfile = require('../models/ITUserProfile');
const ITAdminProfile = require('../models/ITAdminProfile');

// --- NEW IMPORTS (Required for the Menu to work) ---
const SystemConfig = require('../models/SystemConfig');
const masterFeatures = require('../config/masterFeatures');

const { ROLE_MAP } = require('../config/systemRoles');

const { getSystemUserDTO, getStandardUserDTO } = require('../utils/userDTO');

// ==========================================
// 1. SESSION INFO ROUTE (Existing)
// ==========================================
router.get('/info', async (req, res) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token' });

  try {
    const session = await Session.findOne({ 
      sessionToken: token, 
      expiresAt: { $gt: new Date() } 
    }).populate('userId').populate('tenantId');

    if (!session) return res.status(401).json({ error: 'Session expired' });

    const user = session.userId;

    // Update last activity conditionally (avoid write on every request)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    if (!session.lastActivity || session.lastActivity < fiveMinutesAgo) {
      await Session.updateOne({ _id: session._id }, { $set: { lastActivity: new Date() } });
    }

    const systemDbRoles = ['it_admin', 'it_user', 'noteloom_admin', 'noteloom_manager'];
    const isSystemUser = systemDbRoles.includes(user.role) || session.isSystemSession;

    // PATH A: SYSTEM USER
    if (isSystemUser) {
      const systemUserDTO = await getSystemUserDTO(user);
      return res.json({
        sessionToken: token,
        user: systemUserDTO,
        tenant: null,
        role: systemUserDTO.role,
        isSystemUser: true
      });
    }

    // PATH B: STANDARD USER
    if (!session.tenantId) return res.status(401).json({ error: 'No tenant' });

    const membership = await Membership.findOne({
      userId: user._id,
      tenantId: session.tenantId._id,
      status: 'active'
    });

    if (!membership) return res.status(403).json({ error: 'Membership inactive' });

    const effectiveRole = membership.role;
    const standardUserDTO = await getStandardUserDTO(user, effectiveRole);

    res.json({
      sessionToken: token,
      user: standardUserDTO,
      tenant: {
        id: session.tenantId._id,
        name: session.tenantId.name,
        type: session.tenantId.type,
        logoUrl: session.tenantId.logoUrl
      },
      role: effectiveRole,
      isSystemUser: false
    });

  } catch (error) {
    console.error('Session info error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ==========================================
// 2. MENU FILTERING ROUTE (The Missing Link)
// ==========================================
router.get('/menu', async (req, res) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token' });

  try {
    // A. Validate Session
    const session = await Session.findOne({ 
      sessionToken: token, 
      expiresAt: { $gt: new Date() } 
    }).populate('userId');

    if (!session) return res.status(401).json({ error: 'Session expired' });

    const user = session.userId;
    const systemDbRoles = ['it_admin', 'it_user', 'noteloom_admin', 'noteloom_manager'];
    const isSystemUser = systemDbRoles.includes(user.role) || session.isSystemSession;

    // System users (IT Admin) don't use this menu endpoint
    if (isSystemUser) return res.json([]);

    // B. Get Membership to find Role & Tenant
    const membership = await Membership.findOne({
      userId: user._id,
      tenantId: session.tenantId,
      status: 'active'
    });

    if (!membership) return res.status(403).json({ error: 'Membership inactive' });

    // C. Determine Role Key (student/faculty/college_admin)
    const effectiveRole = membership.role;
    const menuRoleKey = (effectiveRole === 'individual_student') ? 'student' : effectiveRole;

    // D. Fetch Master List & Tenant Config
    const masterList = masterFeatures[menuRoleKey] || [];
    
    const configDoc = await SystemConfig.findOne({ tenantId: session.tenantId });
    const tenantConfig = configDoc && configDoc.config && configDoc.config[menuRoleKey] 
      ? configDoc.config[menuRoleKey] 
      : [];

    // E. FILTER: Only return items where isActive is true
    const allowedMenu = masterList.filter(item => {
      const setting = tenantConfig.find(c => c.key === item.key);
      // If setting exists, obey it. If NOT exists, default to TRUE.
      return setting ? setting.isActive : true;
    });

    res.json(allowedMenu);

  } catch (error) {
    console.error('Menu fetch error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;