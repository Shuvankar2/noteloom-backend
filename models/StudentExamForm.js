const mongoose = require('mongoose');

const studentExamFormSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant' },
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExamSession', required: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  
  // Student Snapshot (Locked at time of exam)
  studentName: String,
  rollNo: String,
  course: String,     // Stream Name
  currentTerm: Number, // Sem/Trim number
  
  // Subjects
  regularSubjects: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Subject' }],
  backlogSubjects: [{ 
    subjectCode: String,
    term: Number // The term this backlog belongs to
  }],

  // Fee Details
  feeBreakdown: {
    regularFee: Number,
    backlogFee: Number,
    totalPaid: Number,
    transactionId: String
  },

  paymentStatus: { type: String, enum: ['Pending', 'Paid'], default: 'Paid' }, // default Paid for demo
  admitCardGenerated: { type: Boolean, default: true },
  submittedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('StudentExamForm', studentExamFormSchema);