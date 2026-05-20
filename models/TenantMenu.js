const mongoose = require('mongoose');

const tenantMenuSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  role: { type: String, enum: ['student', 'faculty', 'college_admin'], required: true },
  tabs: [
    {
      title: { type: String, required: true },
      key: { type: String, required: true },
      icon: { type: String, default: 'Default' },
      description: { type: String },
      isActive: { type: Boolean, default: true },
      order: { type: Number, default: 0 }
    }
  ],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});
tenantMenuSchema.index({ tenantId: 1, role: 1 }, { unique: true });

module.exports = mongoose.model('TenantMenu', tenantMenuSchema);