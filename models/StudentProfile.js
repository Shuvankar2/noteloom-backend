const mongoose = require('mongoose');

const studentProfileSchema = new mongoose.Schema({
  uid: { type: String, unique: true, sparse: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch' },
  profilePicture: String,
  phoneNumber: String,
  gender: String,
  admissionYear: Number,
  course: String,
  stream: String,
  year: String,
  rollNo: String,
  currentSemester: Number
});

studentProfileSchema.index({ userId: 1, tenantId: 1 }, { unique: true });
studentProfileSchema.index({ rollNo: 1, tenantId: 1 }, { unique: true });

studentProfileSchema.index({ batchId: 1 });

module.exports = mongoose.model('StudentProfile', studentProfileSchema);