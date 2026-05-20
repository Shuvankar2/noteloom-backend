const mongoose = require('mongoose');

const subjectSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true },
  name: { type: String, required: true },
  code: { type: String, required: true },
  type: { type: String, enum: ['Theory', 'Practical', 'Sessional'], default: 'Theory' },
  credits: { type: Number, default: 3, min: 0 },
  semester: { type: Number, required: true, min: 1, max: 8 },
  year: { type: Number, required: true }, // Auto-set (e.g. 2025)
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});
subjectSchema.index({ tenantId: 1, code: 1 }, { unique: true });

module.exports = mongoose.model('Subject', subjectSchema);