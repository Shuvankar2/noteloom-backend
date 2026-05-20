const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();
const connectDB = require('./config/db');
const EmailVerification = require('./models/EmailVerification'); // Kept for the cleanup job

// --- ROUTE IMPORTS ---
const authRoutes = require('./routes/authRoutes');
const itAdminRoutes = require('./routes/itAdminRoutes');
const collegeAdminRoutes = require('./routes/collegeAdminRoutes');
const aiRoutes = require('./routes/aiRoutes');
const leaveRoutes = require('./routes/leaveRoutes');
const departmentRoutes = require('./routes/departmentRoutes');
const classroomRoutes = require('./routes/classroomRoutes');
const lmsRoutes = require('./routes/lmsRoutes');
const batchRoutes = require('./routes/batchRoutes');
const timetableRoutes = require('./routes/timetableRoutes');
const noticeRoutes = require('./routes/noticeRoutes');
const coeRoutes = require('./routes/coeRoutes');
const systemRoutes = require('./routes/systemRoutes');
const sessionRoutes = require('./routes/sessionRoutes');
const libraryRoutes = require('./routes/libraryRoutes');
const { PhysicalBook } = require('./models/Library');
const attendanceRoutes = require('./routes/attendanceRoutes');


// --- MIDDLEWARE IMPORT ---
const { setTenantContext } = require('./middleware/authMiddleware');

// --- INITIALIZATION ---
const app = express();
connectDB(); // Connect to MongoDB

// --- GLOBAL MIDDLEWARE ---
app.use(express.json());
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:5173'],
  credentials: true
}));

// --- STATIC FILES ---
// Serves files from ../webdata folder
const webdataDir = path.join(__dirname, '../webdata');
app.use('/webdata', express.static(webdataDir));



// --- ROUTE MOUNTING ---

// 1. Authentication (Public)
app.use('/api/auth', authRoutes); 

app.use('/session', sessionRoutes);

// IT Login Route (Separate Prefix)
app.use('/it-auth', itAdminRoutes);

// 2. IT Admin (Internal System Management)
app.use('/it-admin', itAdminRoutes); 

// 3. College Admin (Context-Aware)
// 'setTenantContext' ensures req.tenant is populated for admin actions
app.use('/api/college-admin', setTenantContext, collegeAdminRoutes);

// 4. AI Features
app.use('/api/ai', setTenantContext, aiRoutes);

// 5. Core Academics
app.use('/api/departments', departmentRoutes);
app.use('/api/classrooms', classroomRoutes);
app.use('/api/batches', batchRoutes);

// 6. Schedules & Notices
app.use('/api/notices', noticeRoutes);

// 7. Exam, System & Leaves
app.use('/api/coe', coeRoutes);
app.use('/', systemRoutes);
app.use('/api/leave', leaveRoutes);

app.use('/api', timetableRoutes); // Handles /calendar, /routine, /lessons
app.use('/api', lmsRoutes); // Handles /modules and /content
app.use('/api/library', libraryRoutes);
app.use('/api/attendance', attendanceRoutes); // Handles attendance-related routes

// --- HEALTH CHECK ---
app.get('/health', (req, res) => {
  res.json({ status: 'Backend is working!', timestamp: new Date() });
});

// --- SCHEDULED TASKS ---
// Cleanup expired email verification codes every hour
setInterval(async () => {
  try {
    const result = await EmailVerification.deleteMany({ expiresAt: { $lt: new Date() } });
    if (result.deletedCount > 0) {
      console.log(`🧹 Cleaned up ${result.deletedCount} expired verification codes`);
    }
  } catch (error) {
    console.error('Cleanup error:', error);
  }
}, 60 * 60 * 1000); 

// Cleanup physical books scheduled for deletion (48-hour buffer)
setInterval(async () => {
  try {
    const result = await PhysicalBook.deleteMany({
      deleteAfter: { $lte: new Date() }
    });

    if (result.deletedCount > 0) {
      console.log(`🗑️ Permanently deleted ${result.deletedCount} physical book(s) after buffer`);
    }
  } catch (error) {
    console.error('Physical book cleanup error:', error);
  }
}, 60 * 60 * 1000); // runs every hour


// --- START SERVER ---
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`Test it: http://localhost:${PORT}/health`);
});