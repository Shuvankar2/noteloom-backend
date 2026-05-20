const mongoose = require('mongoose');

const batchSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
  streamCode: String,
  admissionYear: { type: Number, required: true },
  admissionMonth: { type: String, required: true },
  batchName: { type: String },
  section: { type: String, default: 'A' },
  currentTerm: { type: Number, default: 1 },
  isAlumni: { type: Boolean, default: false },
  faculty: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  students: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Batch', batchSchema);