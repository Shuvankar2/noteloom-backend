const Session = require('../models/Session'); 
const Membership = require('../models/Membership'); 

// 1. Middleware for Tenant Context (Students, Faculty, College Admin)
const setTenantContext = async (req, res, next) => {
  const sessionToken = req.headers.authorization?.replace('Bearer ', '');
  if (!sessionToken) {
    return res.status(401).json({ error: 'No session token provided' });
  }

  try {
    const session = await Session.findOne({
      sessionToken,
      expiresAt: { $gt: new Date() }
    }).populate([
      { path: 'userId', select: 'name email' },
      { path: 'tenantId', select: 'name type logoUrl collegeCode' }
    ]);

    if (!session) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }

    const membership = await Membership.findOne({
      userId: session.userId._id,
      tenantId: session.tenantId._id,
      status: 'active'
    });

    if (!membership) {
      return res.status(403).json({ error: 'User not authorized for this tenant' });
    }

    req.user = {
      id: session.userId._id,
      name: session.userId.name,
      email: session.userId.email
    };
    
    req.tenant = {
      id: session.tenantId._id,
      name: session.tenantId.name,
      type: session.tenantId.type,
      logoUrl: session.tenantId.logoUrl,
      collegeCode: session.tenantId.collegeCode
    };
    
    req.role = membership.role;
    req.sessionId = session._id;

    // Update last activity — only if stale by more than 5 minutes to avoid
    // a DB write on every single authenticated request.
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    if (!session.lastActivity || session.lastActivity < fiveMinutesAgo) {
      await Session.updateOne(
        { _id: session._id },
        { $set: { lastActivity: new Date() } }
      );
    }

    next();
  } catch (error) {
    console.error('Session validation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// 2. Middleware for IT Admin Context (IT Portal)
const setITContext = async (req, res, next) => {
  const sessionToken = req.headers.authorization?.replace('Bearer ', '');
  if (!sessionToken) {
    return res.status(401).json({ error: 'No session token provided' });
  }

  try {
    const session = await Session.findOne({
      sessionToken,
      expiresAt: { $gt: new Date() }
    }).populate('userId');

    if (!session || !session.userId) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }

    // 🔐 Strict Check: Allow only 'it_admin' or 'it_user' roles
    const membership = await Membership.findOne({
      userId: session.userId._id,
      role: { $in: ['it_admin', 'it_user'] },
      status: 'active'
    });

    if (!membership) {
      return res.status(403).json({ error: 'IT Portal Access Denied' });
    }

    // 🔄 Role Normalization for Frontend Compatibility
    // Database 'it_admin' -> Frontend 'noteloom_admin'
    // Database 'it_user'  -> Frontend 'noteloom_manager'
    const frontendRole = membership.role === 'it_admin' 
      ? 'noteloom_admin' 
      : 'noteloom_manager';

    req.itUser = {
      id: session.userId._id,
      name: session.userId.name,
      email: session.userId.email,
      role: frontendRole,       // Used for permission checks (e.g. req.itUser.role === 'noteloom_admin')
      originalRole: membership.role // Kept for DB operations/reference
    };

    req.sessionId = session._id;
    next();
  } catch (error) {
    console.error('IT Session validation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = { setTenantContext, setITContext };