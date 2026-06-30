// backend/routes/attendanceRoutes.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { Routine, Attendance } = require('../models/AttendanceModels'); // Removed WeeklyReport if not used here
const StudentProfile = require('../models/StudentProfile'); 
const { setTenantContext } = require('../middleware/authMiddleware');

router.use(setTenantContext);

// GET /api/attendance/faculty/init?batchId=...
router.get('/faculty/init', async (req, res) => {
  try {
    const { batchId, date } = req.query;
    if (!batchId) return res.status(400).json({ error: "Batch ID required" });

    // 1. Determine Date & Day
    // Use provided date or default to Today
    const targetDate = date ? new Date(date) : new Date();
    targetDate.setHours(0, 0, 0, 0); // Normalize to midnight

    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayOfWeek = days[targetDate.getDay()];

    // 2. Fetch Students
    const studentProfiles = await StudentProfile.find({ 
      tenantId: req.tenant.id, 
      batchId: batchId 
    }).populate('userId', 'name email');

    const students = studentProfiles
      .filter(p => p.userId) 
      .map(p => ({
        _id: p.userId._id, 
        name: p.userId.name,
        uid: p.uid || p.rollNo || "N/A"
      }));

    // 3. Fetch Routine for the Specific Day
    const routine = await Routine.findOne({ 
      tenantId: req.tenant.id, 
      batchId: batchId,
      dayOfWeek: dayOfWeek 
    })
    .populate('periods.subjectId', 'name code') 
    .populate('periods.facultyId', 'name');

    // 4. FETCH EXISTING ATTENDANCE (For Edit Mode)
    // We fetch all attendance records for this batch on this date
    const existingRecords = await Attendance.find({
      tenantId: req.tenant.id,
      batchId: batchId,
      date: targetDate
    });

    // Transform existing records into a map: { periodId: { studentId: status } }
    const attendanceMap = {};
    existingRecords.forEach(doc => {
        // Assuming doc.periodId corresponds to the routine period._id
        if(doc.periodId) {
            attendanceMap[doc.periodId] = {};
            doc.records.forEach(r => {
                attendanceMap[doc.periodId][r.studentId] = r.status;
            });
        }
    });

    res.json({
      students,
      todaySchedule: routine ? routine.periods : [],
      day: dayOfWeek,
      date: targetDate,
      existingAttendance: attendanceMap // Send this to frontend
    });

  } catch (e) {
    console.error("Init Error:", e);
    res.status(500).json({ error: e.message });
  }
});

// In your Express Backend Route file

router.get('/attendance/report', async (req, res) => {
  try {
    const { batchId, startDate, endDate } = req.query;

    // 1. Fetch all students in batch
    const batch = await Batch.findById(batchId).populate('students');
    const allStudents = batch.students;

    // 2. Aggregate Attendance Counts
    // We only count 'Present' or 'Excused' (Depending on your policy, usually Excused doesn't penalize)
    // Here counting 'Present' + 'Excused' as 1
    const attendanceData = await Attendance.aggregate([
      {
        $match: {
          batchId: new mongoose.Types.ObjectId(batchId),
          date: { $gte: new Date(startDate), $lte: new Date(endDate) }
        }
      },
      { $unwind: "$records" },
      {
        $match: {
          "records.status": { $in: ["Present", "Excused"] } // Counting both as attended/valid
        }
      },
      {
        $group: {
          _id: "$records.studentId",
          presentCount: { $sum: 1 }
        }
      }
    ]);

    // 3. Map counts to student details (Handle students with 0 attendance)
    const report = allStudents.map(student => {
      const record = attendanceData.find(a => a._id.toString() === student._id.toString());
      return {
        studentId: student._id,
        name: student.name,
        username: student.username, // Noteloom ID
        presentCount: record ? record.presentCount : 0
      };
    });

    // Note: The frontend will take this array, find the Max(presentCount), 
    // and divide everyone else's count by that Max to get the %
    
    res.json(report);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/attendance/mark
router.post('/mark', async (req, res) => {
  try {
    const { batchId, periodId, subjectId, date, records } = req.body;
    const recordDate = new Date(date);
    recordDate.setHours(0, 0, 0, 0);

    const attendance = await Attendance.findOneAndUpdate(
      { batchId, periodId, date: recordDate },
      { 
        tenantId: req.tenant.id,
        facultyId: req.user.id,
        subjectId,
        records, 
        isFinalized: true 
      },
      { upsert: true, new: true }
    );
    res.json({ success: true, message: "Attendance Saved" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;