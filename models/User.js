const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  // --- 0.Noteloom ID ---
   noteloomId: {
    type: String,
    unique: true,
    sparse: true,   // allows existing users without it
    index: true
  },

  // --- 1. Your Existing Core Fields ---
  email: { type: String, required: true, unique: true },
  name: { type: String, required: true }, // This is your primary name field
  password: { type: String, required: true },
  emailVerified: { type: Boolean, default: true },
  deletionScheduledAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },

  // --- 2. REQUIRED ADDITIONS FOR LEAVE SYSTEM ---
  
  // We add 'role' here so authentication middleware can easily check permissions 
  // without needing to query the 'Membership' collection every time.
  role: { 
    type: String, 
    enum: ['student', 'faculty', 'college_admin', 'individual_student', 'it_user', 'it_admin', 'noteloom_manager', 'noteloom_admin'], 
    default: 'student' 
  },

  // 'department' is REQUIRED for the Leave Manager to filter requests (e.g., "CSE" vs "ECE").
  // When a FacultyProfile is created/updated, you should also update this field.
  department: { type: String, default: 'General' },

  // Optional: Useful for multi-tenant context without joining 'Tenant' table constantly
  college: { type: String } 
});

// --- 3. Virtual Property for Compatibility ---
// Your schema uses 'name', but the Leave System frontend expects 'fullName'.
// This virtual field maps 'name' to 'fullName' automatically.
userSchema.virtual('fullName').get(function() {
  return this.name;
});

// Ensure virtuals are included when converting to JSON/Object
userSchema.set('toJSON', { virtuals: true });
userSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('User', userSchema);