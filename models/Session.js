const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  sessionToken: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
  lastActivity: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now }
});

// TTL index: MongoDB auto-deletes expired sessions (no cron job needed)
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
// Index for fast lastActivity updates
sessionSchema.index({ lastActivity: 1 });

module.exports = mongoose.model('Session', sessionSchema);