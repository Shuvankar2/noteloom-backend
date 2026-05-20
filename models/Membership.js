const mongoose = require('mongoose');

const membershipSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  role: {
    type: String,
    enum: ['student', 'faculty', 'college_admin', 'individual_student', 'it_user', 'it_admin'],
    required: true
  },
  status: { type: String, enum: ['active', 'suspended'], default: 'active' },
  joinedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Membership', membershipSchema);