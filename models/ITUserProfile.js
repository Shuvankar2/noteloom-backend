const mongoose = require('mongoose');

const itUserProfileSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  uid: { type: String, unique: true, sparse: true }, // Employee ID
  employeeId: String, // Alternate ID field
  designation: String,
  department: { type: String, default: 'IT Support' },
  profilePicture: String,
  specialization: String
});

module.exports = mongoose.model('ITUserProfile', itUserProfileSchema);