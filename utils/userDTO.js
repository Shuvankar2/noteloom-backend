const { ROLE_MAP } = require('../config/systemRoles');
const ITAdminProfile = require('../models/ITAdminProfile');
const ITUserProfile = require('../models/ITUserProfile');
const StudentProfile = require('../models/StudentProfile');
const FacultyProfile = require('../models/FacultyProfile');
const AdminProfile = require('../models/AdminProfile');

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

  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: frontendRole, 
    uid: uid,           
    department: dept,
    isSystemUser: true
  };
};

/**
 * Fetches the standard user profile (student/faculty/college_admin) with standardized structure.
 * @param {Object} user - The mongoose User object
 * @param {string} effectiveRole - The user's active membership role
 * @returns {Promise<Object>} - Standardized Frontend User Object
 */
const getStandardUserDTO = async (user, effectiveRole) => {
  let uid = 'N/A';
  let deptName = 'General';

  if (effectiveRole === 'student' || effectiveRole === 'individual_student') {
    const p = await StudentProfile.findOne({ userId: user._id });
    if (p) { 
      uid = p.uid || p.rollNo; 
      deptName = p.stream || 'General'; 
    }
  } else if (effectiveRole === 'faculty') {
    const p = await FacultyProfile.findOne({ userId: user._id });
    if (p) { 
      uid = p.uid || p.employeeId; 
      deptName = p.department || 'General'; 
    }
  } else if (effectiveRole === 'college_admin') {
    const p = await AdminProfile.findOne({ userId: user._id });
    if (p) { 
      uid = p.uid || p.employeeId; 
      deptName = 'Administration'; 
    }
  }

  return {
    id: user._id,
    name: user.name,
    email: user.email,
    uid: uid,
    department: deptName
  };
};

module.exports = { 
  getSystemUserDTO,
  getStandardUserDTO
};