const mongoose = require('mongoose');

const adminProfileSchema = new mongoose.Schema({
  uid: { type: String, unique: true, sparse: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  adminLevel: String,
  employeeId: String,
  responsibilities: String
});

adminProfileSchema.index({ userId: 1, tenantId: 1 }, { unique: true });
adminProfileSchema.index({ employeeId: 1, tenantId: 1 }, { unique: true });

module.exports = mongoose.model('AdminProfile', adminProfileSchema);