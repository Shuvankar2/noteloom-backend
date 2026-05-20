const mongoose = require('mongoose');

const departmentSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  name: { type: String, required: true },
  code: { type: String },
  headOfDepartment: { type: String },
  streams: [{
    name: { type: String, required: true },
    code: { type: String },
    isConfigured: { type: Boolean, default: false },
    isLocked: { type: Boolean, default: false },
    curriculumType: { type: String, enum: ['Semester', 'Trimester'], default: 'Semester' },
    totalTerms: { type: Number, default: 8 },
    termStructure: {
      oddStartMonth: { type: String, default: 'July' },
      oddEndMonth: { type: String, default: 'December' },
      evenStartMonth: { type: String, default: 'January' },
      evenEndMonth: { type: String, default: 'June' }
    },
    trimesterStructure: {
      term1Start: { type: String, default: 'January' },
      term1End: { type: String, default: 'April' },
      term2Start: { type: String, default: 'May' },
      term2End: { type: String, default: 'August' },
      term3Start: { type: String, default: 'September' },
      term3End: { type: String, default: 'December' }
    }
  }],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Department', departmentSchema);