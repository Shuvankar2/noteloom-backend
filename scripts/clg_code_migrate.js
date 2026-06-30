// backend/scripts/clg_code_migrate.js
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Import the Tenant model
const Tenant = require('../models/Tenant');

// Define your mapping of College Names to your existing Codes
const collegeMappings = [
  { name: "Institute of Engineering Management Kolkata", code: "1001" }
  // Add all your colleges here...
];

async function migrateCodes() {
  try {
    // 1. Connect to MongoDB using your .env URI
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/your_db_name';
    await mongoose.connect(uri);
    console.log("📡 Connected to MongoDB for migration...");

    let updatedCount = 0;

    // 2. Iterate and Update
    for (const mapping of collegeMappings) {
      const result = await Tenant.findOneAndUpdate(
        { name: mapping.name },
        { collegeCode: mapping.code },
        { new: true }
      );

      if (result) {
        console.log(`✅ SUCCESS: [${mapping.code}] assigned to ${mapping.name}`);
        updatedCount++;
      } else {
        console.warn(`⚠️  SKIP: Could not find college named "${mapping.name}" in database.`);
      }
    }

    console.log(`\n✨ Migration Finished. Updated ${updatedCount} colleges.`);
    process.exit(0);
  } catch (error) {
    console.error("❌ Migration Error:", error);
    process.exit(1);
  }
}

migrateCodes();