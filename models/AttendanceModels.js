// backend/models/AttendanceModels.js
const mongoose = require('mongoose');

// 1. ROUTINE (The Weekly Timetable)
// Defines which subject is taught in which period for a specific batch
const routineSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', required: true },
  dayOfWeek: { type: String, required: true }, // e.g., 'Monday', 'Tuesday'
  periods: [{
    periodNumber: Number, // 1, 2, 3...
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject' },
    facultyId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Who teaches this?
    startTime: String, // "09:00"
    endTime: String    // "10:00"
  }]
});

// 2. ATTENDANCE (The Transactional Record)
// Stores the actual "Present/Absent" data for a specific period
const attendanceSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  date: { type: Date, required: true }, // Stored as midnight UTC to prevent duplicates
  batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', required: true },
  periodId: { type: mongoose.Schema.Types.ObjectId }, // Links to the specific period in Routine (optional but good for tracking)
  subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
  facultyId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // Who marked it?
  
  // The actual list of students and their status
  records: [{
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['Present', 'Absent', 'Leave', 'Late'], default: 'Present' }
  }],
  
  isFinalized: { type: Boolean, default: true },
  markedAt: { type: Date, default: Date.now }
});

// 3. WEEKLY REPORT (The Summary)
// Sent to Admin Dashboard for review
const weeklyReportSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant' },
  batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch' },
  weekStartDate: Date,
  weekEndDate: Date,
  generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  status: { type: String, enum: ['Pending', 'Reviewed'], default: 'Pending' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = {
  Routine: mongoose.model('Routine', routineSchema),
  Attendance: mongoose.model('Attendance', attendanceSchema),
  WeeklyReport: mongoose.model('WeeklyReport', weeklyReportSchema)
};