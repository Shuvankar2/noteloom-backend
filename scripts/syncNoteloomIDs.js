const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

// ✅ Import models (paths are CORRECT for your structure)
const User = require('../models/User');
const StudentProfile = require('../models/StudentProfile');
const FacultyProfile = require('../models/FacultyProfile');
const AdminProfile = require('../models/AdminProfile');
const ITAdminProfile = require('../models/ITAdminProfile');
const ITUserProfile = require('../models/ITUserProfile');

const MONGO_URI = process.env.MONGODB_URI;

async function syncNoteloomIds() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ MongoDB connected');

    const mappings = [
      { model: StudentProfile, role: 'student' },
      { model: FacultyProfile, role: 'faculty' },
      { model: AdminProfile, role: 'college_admin' },
      { model: ITAdminProfile, role: 'it_admin' },
      { model: ITUserProfile, role: 'it_user' }
    ];

    let updatedCount = 0;

    for (const { model, role } of mappings) {
      const profiles = await model.find({ uid: { $exists: true } });

      for (const profile of profiles) {
        const result = await User.updateOne(
          { _id: profile.userId, noteloomId: { $exists: false } },
          {
            $set: {
              noteloomId: profile.uid,
              role
            }
          }
        );

        if (result.modifiedCount > 0) {
          updatedCount++;
        }
      }
    }

    console.log(`🎉 Sync complete. Users updated: ${updatedCount}`);
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('❌ Sync failed:', err);
    process.exit(1);
  }
}

syncNoteloomIds();
