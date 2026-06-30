const { ROLE_MAP } = require('../config/systemRoles');
const ITAdminProfile = require('../models/ITAdminProfile');
const ITUserProfile = require('../models/ITUserProfile');

/**
 * Fetches the full system user profile with standardized structure.
 * @param {Object} user - The mongoose User object
 * @returns {Promise<Object>} - Standardized Frontend User Object
 */
const getSystemUserDTO = async (user) => {
  const frontendRole = ROLE_MAP[user.role] || user.role;
  
  let uid = 'N/A';
  let dept = 'General';
  let profile = null;

  // Dynamic Profile Lookup
  if (user.role === 'it_admin') {
    profile = await ITAdminProfile.findOne({ userId: user._id });
    if (profile) {
      uid = profile.uid || profile.employeeId;
      dept = profile.department || 'System Admin';
    }
  } else if (user.role === 'it_user') {
    profile = await ITUserProfile.findOne({ userId: user._id });
    if (profile) {
      uid = profile.uid || profile.employeeId;
      dept = profile.department || 'IT Support';
    }
  }
  // Future roles can be added here as: else if (user.role === 'new_role') ...

  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: frontendRole, // e.g., 'noteloom_admin' (Red Badge)
    uid: uid,           // e.g., 'ADM-001'
    department: dept,
    isSystemUser: true
  };
};

module.exports = { getSystemUserDTO };