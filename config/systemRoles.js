// Database Roles (Internal Storage)
const DB_ROLES = {
  SUPER_ADMIN: 'it_admin',
  MANAGER: 'it_user',
  // Future roles:
  // MODERATOR: 'it_moderator', 
};

// Frontend Roles (What the UI expects for badges/permissions)
const FRONTEND_ROLES = {
  SUPER_ADMIN: 'noteloom_admin',
  MANAGER: 'noteloom_manager',
  // Future roles:
  // MODERATOR: 'noteloom_moderator',
};

// Mapping: DB Role -> Frontend Role
const ROLE_MAP = {
  [DB_ROLES.SUPER_ADMIN]: FRONTEND_ROLES.SUPER_ADMIN,
  [DB_ROLES.MANAGER]: FRONTEND_ROLES.MANAGER,
};

// Configuration for ID Generation & Profiles
const ROLE_CONFIG = {
  [DB_ROLES.SUPER_ADMIN]: {
    prefix: 'ADM',
    profileModel: 'ITAdminProfile',
    defaultDept: 'System Administration'
  },
  [DB_ROLES.MANAGER]: {
    prefix: 'MGR',
    profileModel: 'ITUserProfile',
    defaultDept: 'IT Support'
  }
};

module.exports = { DB_ROLES, FRONTEND_ROLES, ROLE_MAP, ROLE_CONFIG };