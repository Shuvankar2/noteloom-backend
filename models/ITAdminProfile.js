const mongoose = require('mongoose');

const itAdminProfileSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  uid: { type: String, unique: true, sparse: true },
  employeeId: String,
  adminLevel: { type: String, default: 'Super Admin' },
  profilePicture: String
});

module.exports = mongoose.model('ITAdminProfile', itAdminProfileSchema);