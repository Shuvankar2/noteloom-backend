const mongoose = require('mongoose');

const contentProgressSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  contentId: { type: mongoose.Schema.Types.ObjectId, ref: 'ClassContent', required: true },
  progress: { type: Number, default: 0 },
  isCompleted: { type: Boolean, default: false },
  lastWatched: { type: Date, default: Date.now }
});
contentProgressSchema.index({ userId: 1, contentId: 1 }, { unique: true });

module.exports = mongoose.model('ContentProgress', contentProgressSchema);