const path = require('path');
require('dotenv').config({
  path: path.resolve(__dirname, '../.env')
});

const mongoose = require('mongoose');

// Models
const User = require('../models/User');
const ITUserProfile = require('../models/ITUserProfile');

// --- DB CONNECT ---
const connectDB = async () => {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB connected');
  } catch (err) {
    console.error('❌ MongoDB connection failed', err);
    process.exit(1);
  }
};

// --- RESTORE LOGIC ---
const restoreITUsers = async () => {
  try {
    console.log('🔍 Searching for IT-capable users...');

    const users = await User.find({
      role: { $in: ['it_admin', 'it_user', 'noteloom_admin', 'noteloom_manager'] }
    });

    console.log(`👥 Found ${users.length} IT-capable users`);

    let created = 0;

    for (const user of users) {
      const exists = await ITUserProfile.findOne({ userId: user._id });

      if (!exists) {
        await ITUserProfile.create({
          userId: user._id,
          uid: `IT-${Math.floor(100000 + Math.random() * 900000)}`,
          department: 'IT Support'
        });

        console.log(`✅ Created IT profile for ${user.email}`);
        created++;
      }
    }

    console.log(`🎉 Restore complete. New profiles created: ${created}`);
  } catch (err) {
    console.error('❌ Restore failed:', err);
  }
};

// --- MAIN EXECUTION ---
(async () => {
  console.log('🚀 IT User Restore Script Started');

  await connectDB();
  await restoreITUsers();

  console.log('🔌 Closing DB connection');
  await mongoose.disconnect();

  console.log('✅ Script finished');
  process.exit(0);
})();
