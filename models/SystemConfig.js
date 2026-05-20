const mongoose = require('mongoose');

const systemConfigSchema = new mongoose.Schema({
  // Link to specific college
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, unique: true },
  
  // Stores the array of features for each role
  config: {
    student: [{ 
      key: String, 
      isActive: Boolean 
    }],
    faculty: [{ 
      key: String, 
      isActive: Boolean 
    }],
    college_admin: [{ 
      key: String, 
      isActive: Boolean 
    }]
  },
  
  updatedAt: { type: Date, default: Date.now },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});

module.exports = mongoose.model('SystemConfig', systemConfigSchema);