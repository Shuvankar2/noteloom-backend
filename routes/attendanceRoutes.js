// backend/routes/attendanceRoutes.js
const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendanceController');
const { setTenantContext } = require('../middleware/authMiddleware');

router.use(setTenantContext);

// GET /api/attendance/faculty/init
router.get('/faculty/init', attendanceController.initFacultyAttendance);

// GET /api/attendance/report
router.get('/report', attendanceController.getAttendanceReport);

// POST /api/attendance/mark
router.post('/mark', attendanceController.markAttendance);

// GET /api/attendance/weekly-reports
router.get('/weekly-reports', attendanceController.getWeeklyReports);

// POST /api/attendance/weekly-reports/generate
router.post('/weekly-reports/generate', attendanceController.generateWeeklyReport);

module.exports = router;