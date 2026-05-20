// models/ExamSession.js
const mongoose = require('mongoose');

const examSessionSchema = new mongoose.Schema({
  // Link to Tenant for multi-college support
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant' },
  
  // Basic Session Info
  sessionName: { type: String, required: true }, // e.g., "Winter 2025"
  
  // Applicability Scope
  // Determines which students can see this exam form
  applicability: { 
    type: String, 
    enum: ['Semester', 'Trimester', 'Both'], 
    required: true,
    default: 'Both' 
  },
  
  // Cycle Scope
  // Useful to filter students by their current term (e.g., Odd terms 1,3,5 only)
  cycle: {
    type: String,
    enum: ['Odd', 'Even', 'Both'], 
    default: 'Both'
  },

  // Fee Structure
  fees: {
    regular: { type: Number, required: true, default: 0 },
    backlogPerTerm: { type: Number, required: true, default: 0 } // Multiplied by number of failed terms
  },

  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ExamSession', examSessionSchema);