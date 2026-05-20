const mongoose = require('mongoose');

const classContentSchema = new mongoose.Schema({
  moduleId: { type: mongoose.Schema.Types.ObjectId, ref: 'ClassModule' },
  type: String,
  title: String,
  description: String,
  videoUrl: String,
  allowDownload: { type: Boolean, default: true },
  attachments: [{
    originalName: String,
    fileName: String,
    fileUrl: String,
    fileType: String,
    size: Number
  }],
  fileName: String,
  fileUrl: String,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ClassContent', classContentSchema);