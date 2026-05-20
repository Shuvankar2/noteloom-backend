const mongoose = require('mongoose');

const individualContentSchema = new mongoose.Schema({
  title: { type: String, required: true },
  type: { 
    type: String, 
    enum: ['course', 'assignment', 'announcement', 'resource'], 
    required: true 
  },
  content: { type: String, required: true },
  description: String,
  tags: [String],
  difficulty: { 
    type: String, 
    enum: ['beginner', 'intermediate', 'advanced'], 
    default: 'beginner' 
  },
  isActive: { type: Boolean, default: true },
  
  // --- IMPORTANT FIX: Link to 'User' (not ITUser) ---
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  // --------------------------------------------------

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('IndividualContent', individualContentSchema);