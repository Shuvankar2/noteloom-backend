const mongoose = require('mongoose');

// 1. STUDENT SUBJECT MAPPING (Feature #2)
// Links specific students to specific subjects (Critical for Electives)
const studentSubjectSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant' },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch' },
  semester: Number,
  // Array of Subject IDs this student is taking
  subjects: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Subject' }],
  isFrozen: { type: Boolean, default: false } // Locks allocation after approval
});

// 2. EXAM LOGISTICS (Feature #5 & #6)
// Defines where a student sits for a specific exam to generate attendance sheets
const examLogisticsSchema = new mongoose.Schema({
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExamSession' },
  examDate: Date,
  timeSlot: String, 
  roomNumber: String,
  invigilators: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], 
  allocatedStudents: [{ 
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    rollNo: String,
    subjectCode: String
  }]
});

module.exports = {
  StudentSubjectMap: mongoose.model('StudentSubjectMap', studentSubjectSchema),
  ExamLogistics: mongoose.model('ExamLogistics', examLogisticsSchema)
};