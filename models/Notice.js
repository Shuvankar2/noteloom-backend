const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  userName: String,
  text: { type: String, required: true },
  parentId: { type: mongoose.Schema.Types.ObjectId, default: null },
  createdAt: { type: Date, default: Date.now }
});

const noticeSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  type: { type: String, enum: ['staff', 'departmental'], required: true },
  department: { type: String },
  posterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  posterName: String,
  posterRole: String,
  title: { type: String, required: true },
  content: { type: String, required: true },
  attachments: [{
    fileUrl: String,
    fileName: String,
    originalName: String,
    fileType: String,
    mimeType: String,
    size: Number,
    videoConfig: {
      playerType: { type: String, enum: ['mini', 'still'], default: 'mini' }
    }
  }],
  reactions: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    userName: String
  }],
  comments: [commentSchema],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Notice', noticeSchema);