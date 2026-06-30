require('dotenv').config(); // Load .env file
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const ITAdminProfile = require('../models/ITAdminProfile');
const ITUserProfile = require('../models/ITUserProfile');

// --- 1. CONFIGURATION (Embedded for safety) ---
const ROLE_CONFIG = {
  'it_admin': {
    prefix: 'ADM',
    defaultDept: 'System Administration',
    profileModel: ITAdminProfile
  },
  'it_user': {
    prefix: 'MGR',
    defaultDept: 'IT Support',
    profileModel: ITUserProfile
  }
};

const ensureSystemUser = async (email, name, password, role, uidOverride) => {
  // 1. Ensure User Exists
  let user = await User.findOne({ email });
  
  if (!user) {
    console.log(`Creating User: ${email}...`);
    const hashed = await bcrypt.hash(password, 10);
    user = await User.create({
      name,
      email,
      password: hashed,
      role,
      emailVerified: true
    });
  } else {
    console.log(`User ${email} already exists. Checking profile...`);
    // Optional: Fix role if it drifted
    if (user.role !== role) {
        user.role = role;
        await user.save();
    }
  }

  // 2. Ensure Profile Exists
  const config = ROLE_CONFIG[role];
  if (!config) return;

  const ProfileModel = config.profileModel;
  const profile = await ProfileModel.findOne({ userId: user._id });

  if (!profile) {
    console.log(`Creating Profile for ${role}...`);
    await ProfileModel.create({
      userId: user._id,
      uid: uidOverride || `${config.prefix}-${Math.floor(1000 + Math.random() * 9000)}`,
      employeeId: uidOverride || `${config.prefix}-${Math.floor(1000 + Math.random() * 9000)}`,
      department: config.defaultDept,
      ...(role === 'it_admin' ? { adminLevel: 'Super Admin' } : { designation: 'Manager' })
    });
    console.log(`✅ Profile created for ${email}`);
  } else {
    console.log(`Profile for ${email} already exists.`);
  }
};

const runSeed = async () => {
  // ✅ FIX: Use 'MONGODB_URI' to match your .env file
  const dbUri = process.env.MONGODB_URI || process.env.MONGO_URI; 
  
  if (!dbUri) {
    console.error('❌ Error: MONGODB_URI is undefined in .env file');
    process.exit(1);
  }

  try {
    await mongoose.connect(dbUri);
    console.log('🌱 Connected to MongoDB for Seeding...');
    
    // --- DEFINE SYSTEM STAFF HERE ---
    await ensureSystemUser('admin@noteloom.in', 'Note Loom Admin', 'admin123', 'it_admin', 'ADM-001');
    await ensureSystemUser('manager@noteloom.in', 'System Manager', 'manager123', 'it_user', 'MGR-101');
    
    console.log('✅ System Roles Synced Successfully');
    process.exit();
  } catch (error) {
    console.error('❌ Seeding Error:', error);
    process.exit(1);
  }
};

runSeed();