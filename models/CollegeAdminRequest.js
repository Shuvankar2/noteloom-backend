const mongoose = require('mongoose');

const collegeAdminRequestSchema = new mongoose.Schema({
  collegeName: { type: String, required: true },
  adminName: { type: String, required: true },
  adminEmail: { type: String, required: true },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Updated ref
  reviewedAt: Date,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('CollegeAdminRequest', collegeAdminRequestSchema);