const mongoose = require('mongoose');
const { encrypt, decrypt } = require('../utils/crypto');

// 1. Digital Credentials
const credentialSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  providerName: { type: String, required: true },
  loginId: { type: String, required: true, get: decrypt, set: encrypt },
  password: { type: String, required: true, get: decrypt, set: encrypt },
  link: String,
  note: String,
  updatedAt: { type: Date, default: Date.now }
}, { toJSON: { getters: true }, toObject: { getters: true } });

// 2. Digital Resources (Updated)
const digitalResourceSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  title: { type: String, required: true },
  author: { type: String, required: true },
  department: { type: String, required: true }, 
  course: { type: String }, // [NEW] Added Course field
  type: { type: String, enum: ['Video', 'Article', 'Course', 'Portal', 'E-Book', 'Notes', 'Paper', 'Book'], default: 'Notes' },
  url: { type: String, required: true },
  description: String,
  semester: { type: Number, default: 1 },
  // [NEW] Status for Faculty Review Workflow
  status: { type: String, enum: ['Pending', 'Approved', 'Rejected'], default: 'Approved' }, 
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  deleteAfter: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});

// 3. Physical Books (Inventory)
const physicalBookSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  title: { type: String, required: true },
  author: { type: String, required: true },
  isbn: String,
  category: String,
  baseId: { type: String, required: true },

  // 🆕 48-hour buffered delete
  deleteAfter: { type: Date, default: null },

  copies: [{
    copyId: { type: String, required: true },
    status: {
      type: String,
      enum: ['Available', 'Issued', 'Lost', 'Maintenance', 'Removed'],
      default: 'Available'
    },
    issuedTo: {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      name: String,
      email: String,
      noteloomId: String
    },
    issuedDate: Date,
    dueDate: Date
  }]
});


physicalBookSchema.index({ tenantId: 1, baseId: 1 });
physicalBookSchema.index({ tenantId: 1, 'copies.copyId': 1 }, { unique: true });

module.exports = {
  LibraryCredential: mongoose.model('LibraryCredential', credentialSchema),
  DigitalResource: mongoose.model('DigitalResource', digitalResourceSchema),
  PhysicalBook: mongoose.model('PhysicalBook', physicalBookSchema)
};