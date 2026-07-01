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
const { sendOverdueBookEmail } = require('./services/emailService');


// --- MIDDLEWARE IMPORT ---
const { setTenantContext } = require('./middleware/authMiddleware');

// --- INITIALIZATION ---
const app = express();
connectDB(); // Connect to MongoDB

// --- GLOBAL MIDDLEWARE ---
app.use(express.json());
const allowedOrigins = [
  'http://localhost:3000', 
  'http://localhost:5173', 
  'https://noteloomtest.vercel.app', // Production URL
  'https://noteloom-msofe8sfa-shuvankar2s-projects.vercel.app' // Frontend Alpha Branch URL
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow local Postman testing or mobile app requests
    if (!origin) return callback(null, true);

    // Allow exact matches from the array above
    if (allowedOrigins.indexOf(origin) !== -1) {
      return callback(null, true);
    }

    // SECURE DYNAMIC RULE: Accepts any valid preview URL starting with "noteloom" and ending with "vercel.app"
    if (/^https:\/\/noteloom(?:-frontend)?-[a-z0-9-]+\.vercel\.app$/.test(origin)) {
      return callback(null, true);
    }

    // LOCAL NETWORK RULE: Allow localhost, 127.0.0.1, and private subnets (192.168.x.x, 10.x.x.x, 172.16.x.x-172.31.x.x) with any port
    const localNetworkRegex = /^http:\/\/(?:localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[0-1])\.\d+\.\d+)(?::\d+)?$/;
    if (localNetworkRegex.test(origin)) {
      return callback(null, true);
    }

    // HUGGING FACE SPACES RULE: Allow any frontend running on Hugging Face Spaces
    if (/^https:\/\/[a-z0-9-]+\.hf\.space$/.test(origin)) {
      return callback(null, true);
    }

    // Block all other origins
    return callback(new Error('Blocked by CORS policy'), false);
  },
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

// --- SCHEDULED TASKS (Vercel Cron) ---
// Mounted before '/api' catch-all routers to avoid auth middleware interception
app.get('/api/cron/cleanup', async (req, res) => {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return res.status(500).json({ error: 'Cron secret is not configured on the server.' });
  }
  if (req.headers['authorization'] !== `Bearer ${cronSecret}` && req.query.secret !== cronSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const emailResult = await EmailVerification.deleteMany({ expiresAt: { $lt: new Date() } });
    const bookResult = await PhysicalBook.deleteMany({ deleteAfter: { $lte: new Date() } });
    
    // OVERDUE BOOKS DETECTION & ALERTS
    const currentDate = new Date();
    const overdueBooks = await PhysicalBook.find({
      "copies": {
        $elemMatch: {
          "status": "Issued",
          "dueDate": { $lt: currentDate }
        }
      }
    });

    let overdueAlertsCount = 0;
    for (const book of overdueBooks) {
      for (const copy of book.copies) {
        if (copy.status === 'Issued' && copy.dueDate && copy.dueDate < currentDate) {
          const daysOverdue = Math.floor((currentDate - copy.dueDate) / (1000 * 60 * 60 * 24));
          if (daysOverdue > 0 && copy.issuedTo && copy.issuedTo.email) {
            const fineAmount = daysOverdue * 10; // ₹10 per day overdue
            await sendOverdueBookEmail(
              copy.issuedTo.email,
              copy.issuedTo.name || 'Member',
              book.title,
              copy.copyId,
              copy.dueDate,
              daysOverdue,
              fineAmount
            );
            overdueAlertsCount++;
          }
        }
      }
    }

    console.log(`🧹 Cleaned up ${emailResult.deletedCount} emails and ${bookResult.deletedCount} books. Sent ${overdueAlertsCount} library alerts.`);
    res.status(200).json({ 
      success: true, 
      message: 'Cleanup and alerts completed successfully', 
      emailCleaned: emailResult.deletedCount, 
      booksCleaned: bookResult.deletedCount,
      overdueAlertsSent: overdueAlertsCount
    });
  } catch (error) {
    console.error('Cleanup/alerts error:', error);
    res.status(500).json({ error: 'Cleanup/alerts failed' });
  }
});

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
// setInterval(async () => {
//   try {
//     const result = await EmailVerification.deleteMany({ expiresAt: { $lt: new Date() } });
//     if (result.deletedCount > 0) {
//       console.log(`🧹 Cleaned up ${result.deletedCount} expired verification codes`);
//     }
//   } catch (error) {
//     console.error('Cleanup error:', error);
//   }
// }, 60 * 60 * 1000); 

// Cleanup physical books scheduled for deletion (48-hour buffer)
// setInterval(async () => {
//   try {
//     const result = await PhysicalBook.deleteMany({
//       deleteAfter: { $lte: new Date() }
//     });

//     if (result.deletedCount > 0) {
//       console.log(`🗑️ Permanently deleted ${result.deletedCount} physical book(s) after buffer`);
//     }
//   } catch (error) {
//     console.error('Physical book cleanup error:', error);
//   }
// }, 60 * 60 * 1000);

// --- START SERVER ---
// Listen on the port if running in a container/server (Hugging Face, Render, Docker) or locally.
// Vercel serverless environment does not require app.listen() and uses the exported app.
if (process.env.NODE_ENV !== 'production' || process.env.PORT) {
  const PORT = process.env.PORT || 4000;
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`Test it: http://localhost:${PORT}/health`);
  });
}

// Export the app for Vercel's serverless wrapper
module.exports = app;