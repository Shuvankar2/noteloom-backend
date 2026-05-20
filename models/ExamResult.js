const mongoose = require('mongoose');

const examResultSchema = new mongoose.Schema({
  batch: String,
  semester: Number,
  subjectCode: String,
  studentRollNo: String,
  marksObtained: Number,
  totalMarks: Number,
  isPublished: { type: Boolean, default: false }
});

module.exports = mongoose.model('ExamResult', examResultSchema);