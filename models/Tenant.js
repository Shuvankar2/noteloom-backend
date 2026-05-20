const mongoose = require('mongoose');

const tenantSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  type: { type: String, enum: ['college', 'individual'], default: 'college' },
  subdomain: String,
  logoUrl: String,
  collegeCode: { type: String, unique: true, minlength: 4 },
  // --- NEW FIELDS ---
  location: { type: String, default: 'India' }, // e.g., "Kolkata, West Bengal"
  category: { type: String, default: 'University' }, // e.g., "Engineering"
  featured: { type: Boolean, default: false }, // For the star badge shown in the image
  // ------------------
  status: { type: String, enum: ['active', 'suspended'], default: 'active' },
  createdAt: { type: Date, default: Date.now },
  deletionScheduledAt: { type: Date, default: null }
});

module.exports = mongoose.model('Tenant', tenantSchema);