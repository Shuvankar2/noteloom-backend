const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB Atlas');
  } catch (err) {
    console.error('❌ Database connection failed:', err);
    process.exit(1);
  }
};

// ==========================================
//   MODEL DEFINITIONS (Copied from server.js)
// ==========================================

// 1. Counter Schema
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 }
});
const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema);

// 2. Tenant Schema
const tenantSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  type: { type: String, enum: ['college', 'individual'], default: 'college' },
  subdomain: String,
  logoUrl: String,
  collegeCode: { type: String, unique: true, minlength: 4, maxlength: 4 },
  status: { type: String, enum: ['active', 'suspended'], default: 'active' },
  createdAt: { type: Date, default: Date.now }
});
const Tenant = mongoose.models.Tenant || mongoose.model('Tenant', tenantSchema);

// 3. User Schema
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  password: { type: String, required: true },
  emailVerified: { type: Boolean, default: true },
  deletionScheduledAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
  role: { 
    type: String, 
    enum: ['student', 'faculty', 'college_admin', 'individual_student', 'it_user', 'it_admin'], 
    default: 'student' 
  },
  department: { type: String, default: 'General' },
  college: { type: String } 
});
const User = mongoose.models.User || mongoose.model('User', userSchema);

// 4. Membership Schema
const membershipSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  role: {
    type: String,
    enum: ['student', 'faculty', 'college_admin', 'individual_student', 'it_user', 'it_admin'],
    required: true
  },
  status: { type: String, enum: ['active', 'suspended'], default: 'active' },
  joinedAt: { type: Date, default: Date.now }
});
const Membership = mongoose.models.Membership || mongoose.model('Membership', membershipSchema);

// 5. Profiles
const studentProfileSchema = new mongoose.Schema({
  uid: { type: String, unique: true, sparse: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  profilePicture: String,
  phoneNumber: { type: String, required: true },
  gender: { type: String, enum: ['Male', 'Female', 'Other'], required: true },
  admissionYear: { type: Number, required: true },
  course: { type: String, required: true },
  stream: { type: String, required: true },
  year: { type: String, required: true },
  rollNo: { type: String, required: true },
  currentSemester: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});
const StudentProfile = mongoose.models.StudentProfile || mongoose.model('StudentProfile', studentProfileSchema);

const facultyProfileSchema = new mongoose.Schema({
  uid: { type: String, unique: true, sparse: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  department: { type: String, required: true },
  designation: { type: String, required: true },
  qualification: { type: String, required: true },
  employeeId: { type: String, required: true },
  experience: Number,
  specialization: String,
  joinDate: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});
const FacultyProfile = mongoose.models.FacultyProfile || mongoose.model('FacultyProfile', facultyProfileSchema);

const adminProfileSchema = new mongoose.Schema({
  uid: { type: String, unique: true, sparse: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  adminLevel: { type: String, required: true },
  employeeId: { type: String, required: true },
  responsibilities: { type: String, required: true },
  approvalAuthority: String,
  accessLevel: { type: String, enum: ['read_only', 'limited_edit', 'full_edit', 'admin_access'] },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});
const AdminProfile = mongoose.models.AdminProfile || mongoose.model('AdminProfile', adminProfileSchema);

const itUserProfileSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  uid: { type: String, unique: true, sparse: true },
  employeeId: String,
  designation: String,
  department: { type: String, default: 'IT Support' },
  profilePicture: String,
  specialization: String
});
const ITUserProfile = mongoose.models.ITUserProfile || mongoose.model('ITUserProfile', itUserProfileSchema);

const itAdminProfileSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  uid: { type: String, unique: true, sparse: true },
  employeeId: String,
  adminLevel: { type: String, default: 'Super Admin' },
  profilePicture: String
});
const ITAdminProfile = mongoose.models.ITAdminProfile || mongoose.model('ITAdminProfile', itAdminProfileSchema);


// ==========================================
//   SEED LOGIC
// ==========================================

async function seedData() {
  await connectDB();
  
  try {
    console.log('⚙️ Starting Smart Seed (Preserving existing data)...');

    // --- 1. CLEANUP UNWANTED DATA (Individual Student) ---
    console.log('🧹 Removing "Individual Student" context...');
    await Tenant.deleteOne({ name: 'Individual Student' });
    await User.deleteOne({ email: 'individual@email.in' });

    // --- 2. INITIALIZE COUNTERS (Upsert) ---
    console.log('🔢 Verifying ID Counters...');
    const counters = [
      { _id: 'college_registry', seq: 1001 },
      { _id: 'noteloom_emp_90', seq: 1 },
      { _id: 'noteloom_emp_91', seq: 1 },
      { _id: 'uid_1001_2025_001', seq: 1 },
      { _id: 'uid_1001_101_001', seq: 1 },
      { _id: 'uid_1001_102_007', seq: 1 }
    ];

    for (const c of counters) {
      await Counter.findByIdAndUpdate(c._id, { $setOnInsert: { seq: c.seq } }, { upsert: true });
    }

    // --- 3. MANAGE TENANTS (Upsert) ---
    console.log('🏫 Verifying Tenants...');
    
    // A. IEM Kolkata
    const iemTenant = await Tenant.findOneAndUpdate(
      { name: 'Institute of Engineering Management Kolkata' },
      { 
        type: 'college',
        subdomain: 'iem-kolkata',
        logoUrl: 'webdata/clg-logo/IEM-Kolkata.png',
        collegeCode: '1001'
      },
      { upsert: true, new: true }
    );

    // B. Note Loom System (HQ)
    const sysTenant = await Tenant.findOneAndUpdate(
      { name: 'Note Loom System' },
      { 
        type: 'college',
        subdomain: 'sys-admin',
        status: 'active'
      },
      { upsert: true, new: true }
    );

    // --- 4. MANAGE USERS (Upsert) ---
    console.log('👤 Verifying System Users...');
    const hashedPassword = await bcrypt.hash('password123', 10);
    const itHashedPassword = await bcrypt.hash('admin123', 10);

    const upsertUser = async (email, name, pass) => {
      return await User.findOneAndUpdate(
        { email },
        { name, password: pass, emailVerified: true },
        { upsert: true, new: true }
      );
    };

    const studentUser = await upsertUser('student@email.in', 'John Doe', hashedPassword);
    const facultyUser = await upsertUser('faculty@email.in', 'Prof. Jane Smith', hashedPassword);
    const adminUser = await upsertUser('admin@email.in', 'College Admin', hashedPassword);
    
    // IT Users
    const noteloomAdmin = await upsertUser('admin@noteloom.in', 'Note Loom Admin', itHashedPassword);
    const noteloomManager = await upsertUser('manager@noteloom.in', 'Note Loom Manager', itHashedPassword);

    // --- 5. MANAGE MEMBERSHIPS (Upsert) ---
    console.log('🎟️ Verifying Memberships...');

    const upsertMembership = async (user, tenant, role) => {
      await Membership.findOneAndUpdate(
        { userId: user._id, tenantId: tenant._id },
        { role, status: 'active' },
        { upsert: true }
      );
    };

    await upsertMembership(studentUser, iemTenant, 'student');
    await upsertMembership(facultyUser, iemTenant, 'faculty');
    await upsertMembership(adminUser, iemTenant, 'college_admin');
    await upsertMembership(noteloomAdmin, sysTenant, 'it_admin');
    await upsertMembership(noteloomManager, sysTenant, 'it_user');

    // --- 6. MANAGE PROFILES (Upsert) ---
    console.log('🆔 Verifying Profiles...');

    await StudentProfile.findOneAndUpdate(
      { userId: studentUser._id },
      {
        tenantId: iemTenant._id,
        uid: '1001202500001',
        phoneNumber: '9876543210',
        gender: 'Male',
        admissionYear: 2025,
        course: 'B.Tech',
        stream: 'Computer Science & Engineering',
        year: '1st',
        rollNo: 'CSE-001',
        currentSemester: 1
      },
      { upsert: true }
    );

    await FacultyProfile.findOneAndUpdate(
      { userId: facultyUser._id },
      {
        tenantId: iemTenant._id,
        uid: '100120100001',
        department: 'Computer Science & Engineering',
        designation: 'Professor',
        qualification: 'Ph.D',
        employeeId: 'FAC-001',
        experience: 10,
        specialization: 'Artificial Intelligence'
      },
      { upsert: true }
    );

    await AdminProfile.findOneAndUpdate(
      { userId: adminUser._id },
      {
        tenantId: iemTenant._id,
        uid: '100110100001',
        adminLevel: 'College Admin',
        employeeId: 'ADM-001',
        responsibilities: 'System Administration',
        approvalAuthority: 'Full',
        accessLevel: 'full_edit'
      },
      { upsert: true }
    );

    await ITAdminProfile.findOneAndUpdate(
      { userId: noteloomAdmin._id },
      {
        uid: 'IT-ADMIN-01',
        employeeId: '9000001',
        adminLevel: 'Super Admin'
      },
      { upsert: true }
    );

    await ITUserProfile.findOneAndUpdate(
      { userId: noteloomManager._id },
      {
        uid: 'IT-USER-01',
        employeeId: '9100001',
        designation: 'Manager',
        department: 'Operations'
      },
      { upsert: true }
    );

    console.log('✨ Smart Sync Complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding data:', error);
    process.exit(1);
  }
}

seedData();