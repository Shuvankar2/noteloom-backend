const mongoose = require('mongoose');

// --- 1. Personal Calendar Event Schema ---
// Handles personal notes, tasks, and events for all users (Student, Faculty, Admin)
const calendarEventSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: String, required: true }, // Format: YYYY-MM-DD
  type: { type: String, enum: ['Task', 'Event', 'Note'], default: 'Note' },
  title: { type: String, required: true },
  description: String,
  createdAt: { type: Date, default: Date.now }
});

// --- 2. Class Routine (Master Timetable) Schema ---
// Defines the weekly schedule for a specific Batch (Class)
const classRoutineSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant' },
  batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', required: true },
  dayOfWeek: { 
    type: String, 
    enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], 
    required: true 
  },
  periods: [{
    periodNumber: Number, // e.g., 1
    startTime: String,    // e.g., "10:00"
    endTime: String,      // e.g., "11:00"
    isBreak: { type: Boolean, default: false },
    subject: String,
    facultyName: String,  // Abbreviation or Name
    roomNo: String,
    note: String,
    duration: { type: Number, default: 1 } // For merged periods
  }]
});
// Ensure one routine per batch per day
classRoutineSchema.index({ batchId: 1, dayOfWeek: 1 }, { unique: true });

// --- 3. Daily Lesson Log Schema ---
// Tracks what was taught in a specific class on a specific date
const lessonLogSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant' },
  facultyId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch' },
  date: { type: String, required: true }, // YYYY-MM-DD
  dayOfWeek: String,
  subject: String,
  topicsCovered: String,
  remarks: String,
  createdAt: { type: Date, default: Date.now }
});

const CalendarEvent = mongoose.model('CalendarEvent', calendarEventSchema);
const ClassRoutine = mongoose.model('ClassRoutine', classRoutineSchema);
const LessonLog = mongoose.model('LessonLog', lessonLogSchema);

module.exports = { CalendarEvent, ClassRoutine, LessonLog };