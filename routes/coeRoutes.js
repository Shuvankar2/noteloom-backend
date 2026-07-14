const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

// --- Models ---
const QuestionBank = require('../models/QuestionBank');
const ExamSession = require('../models/ExamSession');
const StudentExamForm = require('../models/StudentExamForm');
const ExamResult = require('../models/ExamResult');
const FacultyProfile = require('../models/FacultyProfile');
const AdminProfile = require('../models/AdminProfile');
const StudentProfile = require('../models/StudentProfile'); 
const ITUserProfile = require('../models/ITUserProfile');
const ITAdminProfile = require('../models/ITAdminProfile');
const Subject = require('../models/Subject');
// **NEW IMPORT** for Subject Mapping
const { StudentSubjectMap } = require('../models/COE_Extended'); 

const { setTenantContext } = require('../middleware/authMiddleware');

// Import Cloudinary upload middleware
const { uploadCloud } = require('../config/cloudinary');

// Apply middleware to all routes
router.use(setTenantContext);

// ==========================================
// A. SESSION MANAGEMENT (ADMIN)
// ==========================================

// 1. GET ALL SESSIONS (For Admin List)
router.get('/sessions/all', async (req, res) => {
    try {
        const sessions = await ExamSession.find({ tenantId: req.tenant.id })
            .sort({ createdAt: -1 });
        res.json(sessions);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 2. CREATE NEW SESSION (Handles the "Activate" button from your UI)
router.post('/session', async (req, res) => {
    try {
        // If activating, deactivate all others first to ensure only one is active
        if (req.body.isActive) {
            await ExamSession.updateMany({ tenantId: req.tenant.id }, { isActive: false });
        }
        
        const session = new ExamSession({
            ...req.body,
            tenantId: req.tenant.id
        });
        await session.save();
        res.json(session);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 3. MANAGE EXISTING SESSION (Edit / Activate / Deactivate / Archive)
router.put('/session/:id', async (req, res) => {
    try {
        const { action, updates } = req.body; 
        
        if (action === 'activate') {
            // Rule: Only ONE session can be active at a time
            await ExamSession.updateMany({ tenantId: req.tenant.id }, { isActive: false });
            const session = await ExamSession.findByIdAndUpdate(req.params.id, { isActive: true }, { new: true });
            return res.json(session);
        }
        
        let updateData = {};
        if (action === 'deactivate') updateData = { isActive: false };
        // Assuming you add 'isArchived' to your schema, or just use it as a status flag
        else if (action === 'archive') updateData = { isActive: false, isArchived: true }; 
        else if (action === 'edit') updateData = updates;

        const session = await ExamSession.findByIdAndUpdate(req.params.id, updateData, { new: true });
        res.json(session);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==========================================
// B. STUDENT EXAM PORTAL BACKEND
// ==========================================

// 1. CHECK ELIGIBILITY (Checks Cycle, Stream, and Fees)
router.get('/student/eligibility/:studentId', async (req, res) => {
    try {
        // A. Find Active Session
        const session = await ExamSession.findOne({ tenantId: req.tenant.id, isActive: true });
        if (!session) return res.json({ eligible: false, error: "No active examination session found." });

        // B. Find Student Profile (Deep Populate for Batch/Dept)
        const profile = await StudentProfile.findOne({ userId: req.params.studentId })
            .populate('userId', 'name email')
            .populate({
                path: 'batchId',
                populate: { path: 'departmentId' }
            });

        if (!profile || !profile.batchId) {
            return res.json({ eligible: false, error: "Student batch information not found." });
        }

        const batch = profile.batchId;
        const dept = batch.departmentId;
        
        // Determine Current Semester (Prefer Batch Level, Fallback to Profile)
        const currentSem = batch.currentTerm || profile.currentSemester; 
        const isOddSem = currentSem % 2 !== 0;

        // C. Check Constraints (Cycle: Odd vs Even)
        if (session.cycle !== 'Both') {
            if (session.cycle === 'Odd' && !isOddSem) {
                return res.json({ eligible: false, error: `Session is for Odd terms. You are in Term ${currentSem} (Even).` });
            }
            if (session.cycle === 'Even' && isOddSem) {
                return res.json({ eligible: false, error: `Session is for Even terms. You are in Term ${currentSem} (Odd).` });
            }
        }
        
        // D. Fetch Regular Subjects (Current Semester)
        // Subjects belonging to student's Dept & Current Semester
        const regularSubjectsRaw = await Subject.find({
            departmentId: dept._id,
            semester: currentSem,
            isActive: true
        }).select('name code type credits semester');

        // E. Calculate Backlogs (Previous Semesters - Passed Subjects)
        // 1. Get all potential past subjects (Sem 1 to Current-1)
        const previousSubjects = await Subject.find({
            departmentId: dept._id,
            semester: { $lt: currentSem },
            isActive: true
        }).select('name code type credits semester');

        // 2. Get passed results from ExamResult table
        // We assume passing marks is 40. Adjust if you have a different schema logic.
        const passedResults = await ExamResult.find({
            studentRollNo: profile.rollNo,
            marksObtained: { $gte: 40 } 
        }).select('subjectCode');

        const passedCodes = new Set(passedResults.map(r => r.subjectCode));

        // 3. Filter: Backlog = Previous - Passed
        // Also checks if the backlog matches the current session cycle (e.g., Odd Backlog in Odd Session)
        // Note: Usually, Odd Sem Backlogs are written in Odd Sem Sessions.
        const backlogSubjectsRaw = previousSubjects.filter(sub => {
            const isNotPassed = !passedCodes.has(sub.code);
            return isNotPassed;
        });

        // F. Check for Existing Submission
        const existingForm = await StudentExamForm.findOne({ 
            studentId: req.params.studentId, 
            sessionId: session._id,
            paymentStatus: 'Paid'
        });

        // G. Construct Payload (Mapped to Frontend Props)
        const responseData = { 
            eligible: true, 
            session: {
                id: session._id,
                label: session.sessionName,
                type: session.cycle === 'Both' ? (isOddSem ? 'ODD' : 'EVEN') : session.cycle.toUpperCase()
            },
            feeConfig: {
                regularTheoryFee: session.fees?.regular || 0,
                backlogSemesterFee: session.fees?.backlogPerTerm || 0
            },
            studentProfile: {
                name: profile.userId.name,
                rollNo: profile.rollNo,
                registrationNo: profile.uid || "N/A",
                program: "B.Tech", // Hardcoded or fetch from Dept if available
                stream: dept.name,
                batch: batch.batchName,
                currentSem: currentSem
            },
            // Map 'name' to 'title' for frontend compatibility
            regularSubjects: regularSubjectsRaw.map(s => ({
                id: s._id,
                code: s.code,
                title: s.name, 
                credit: s.credits,
                type: s.type.toUpperCase()
            })),
            backlogSubjects: backlogSubjectsRaw.map(b => ({
                id: b._id,
                code: b.code,
                name: b.name,
                sem: b.semester,
                type: b.type.toUpperCase()
            })),
            existingForm 
        };

        res.json(responseData);

    } catch (e) { 
        console.error(e);
        res.status(500).json({ error: e.message }); 
    }
});

// 2. SUBMIT FORM
router.post('/student/submit-form', async (req, res) => {
    try {
        const { studentId, sessionId, regularSubjects, backlogSubjects, feeBreakdown, studentDetails } = req.body;
        
        // Create Form
        const form = new StudentExamForm({
            tenantId: req.tenant.id,
            sessionId,
            studentId,
            studentName: studentDetails.name,
            rollNo: studentDetails.rollNo,
            
            // Simplified subject storage
            verifiedSubjects: [
                ...regularSubjects.map(s => ({ name: s.title, code: s.code })),
                ...backlogSubjects.map(s => ({ name: s.name, code: s.code }))
            ],
            
            paymentStatus: 'Paid', // Assuming direct success
            admitCardGenerated: true
        });

        await form.save();
        res.json({ success: true, formId: form._id });
    } catch (e) { res.status(500).json({ error: e.message }); }
});


// ==========================================
// 1. STUDENT-SUBJECT ALLOCATION (NEW)
// ==========================================


// [Add this to your existing coeRoutes.js file]

// GET ALL ALLOCATIONS FOR A SINGLE STUDENT (Sorted by Semester)
router.get('/allocation/student/:studentId', async (req, res) => {
  try {
    const maps = await StudentSubjectMap.find({ 
      studentId: req.params.studentId,
      tenantId: req.tenant.id 
    }).populate('subjects'); // Populate subject details for display
    
    // Group by Semester for the frontend
    // Output: { "1": [SubA, SubB], "2": [SubC] }
    const grouped = {};
    maps.forEach(m => {
        if (!grouped[m.semester]) grouped[m.semester] = [];
        grouped[m.semester] = m.subjects;
    });

    res.json(grouped);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET ALLOCATIONS FOR A BATCH
// Returns the existing subject maps for all students in a specific batch
router.get('/allocation/batch/:batchId', async (req, res) => {
  try {
    const maps = await StudentSubjectMap.find({ 
      batchId: req.params.batchId,
      tenantId: req.tenant.id 
    });
    res.json(maps);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// SAVE/UPDATE ALLOCATIONS
// Accepts an array of mappings to upsert (update if exists, insert if new)
router.post('/allocation', async (req, res) => {
  try {
    const { mappings, batchId } = req.body; 
    // mappings format: [ { studentId: '...', subjects: ['subId1', 'subId2'] }, ... ]

    if (!mappings || !Array.isArray(mappings)) {
      return res.status(400).json({ error: "Invalid mappings data" });
    }

    const operations = mappings.map(map => ({
      updateOne: {
        filter: { 
          studentId: map.studentId, 
          batchId: batchId,
          tenantId: req.tenant.id 
        },
        update: { 
          $set: { 
            subjects: map.subjects,
            // Optional: You can add semester logic here if needed
            // semester: map.semester 
          }
        },
        upsert: true
      }
    }));

    if (operations.length > 0) {
      await StudentSubjectMap.bulkWrite(operations);
    }

    res.json({ success: true, message: "Subject mapping updated successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 2. QUESTION BANK
// ==========================================

// Use uploadCloud instead of uploadQB
router.post('/upload-question', uploadCloud.single('file'), async (req, res) => {
  try {
    const { facultyId, facultyName, subjectId, year, category, title } = req.body;
    if (!req.file || !title) return res.status(400).json({ error: 'File and Title required' });

    const question = new QuestionBank({
      tenantId: req.tenant.id, 
      facultyId, 
      facultyName, 
      subjectId, 
      title, 
      year, 
      category,
      // 🟢 NEW: Save the secure Cloudinary URL directly to the database
      fileUrl: req.file.path, 
      fileName: req.file.originalname
    });
    
    await question.save();
    res.json({ message: 'Success' });
  } catch (err) { 
    res.status(500).json({ error: err.message }); 
  }
});

// --- GET QUESTIONS (With Details Restored) ---
router.get('/questions', async (req, res) => {
  try {
    const { facultyId, tenantId, subjectId, year } = req.query;
    const filter = {};

    // 1. Apply Filters
    if (tenantId) filter.tenantId = tenantId;
    
    // Safety check: Only filter by facultyId if it's a valid ID
    if (facultyId && facultyId !== 'undefined' && facultyId !== 'null') {
        filter.facultyId = facultyId;
    }

    if (subjectId && subjectId !== 'undefined') filter.subjectId = subjectId;
    if (year) filter.year = year;

    // 2. Fetch from DB
    const questions = await QuestionBank.find(filter)
      .populate('subjectId', 'name code') // Get Subject Details
      .populate('facultyId', 'name email role') // Get Uploader Details
      .lean()
      .sort({ uploadedAt: -1 });

    // 3. Format Data
    const formatted = await Promise.all(questions.map(async (q) => {
       const subName = q.subjectId ? q.subjectId.name : 'Unknown Subject';
       const subCode = q.subjectId ? q.subjectId.code : 'N/A';
       
       let uid = 'N/A';
       const uploader = q.facultyId; 
       
       if (uploader && uploader._id) {
           let profile = await FacultyProfile.findOne({ userId: uploader._id }).select('uid employeeId');
           if (!profile) profile = await AdminProfile.findOne({ userId: uploader._id }).select('uid employeeId');
           if (!profile) profile = await ITUserProfile.findOne({ userId: uploader._id }).select('uid employeeId');
           if (!profile) profile = await ITAdminProfile.findOne({ userId: uploader._id }).select('uid employeeId');
           
           if (profile) uid = profile.uid || profile.employeeId || 'N/A';
       }

       return {
          _id: q._id,
          title: q.title,
          year: q.year,
          category: q.category,
          fileUrl: q.fileUrl,
          uploadedAt: q.uploadedAt,
          subjectName: subName,
          subjectCode: subCode,
          facultyName: uploader?.name || q.facultyName || 'Unknown',
          facultyUid: uid
       };
    }));
    
    res.json(formatted);
  } catch (err) { 
    console.error("Error fetching questions:", err); 
    res.status(500).json({ error: err.message }); 
  }
});

router.delete('/question/:id', async (req, res) => {
    try {
        const question = await QuestionBank.findById(req.params.id);
        if (question) {
             // 🟢 REMOVED fs.unlinkSync because the file lives on Cloudinary now.
             // It will simply delete the database record.
             await QuestionBank.findByIdAndDelete(req.params.id);
        }
        res.json({ success: true });
    } catch(e) { 
        res.status(500).json({ error: e.message }); 
    }
});

// ==========================================
// 3. EXAM SESSIONS
// ==========================================

router.get('/active-session', async (req, res) => {
  const session = await ExamSession.findOne({ isActive: true });
  res.json(session);
});

// ==========================================
// 4. EXAM FORMS
// ==========================================

router.post('/submit-exam-form', async (req, res) => {
  try {
    const form = new StudentExamForm(req.body);
    await form.save();
    res.json({ success: true, formId: form._id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/my-forms/:studentId', async (req, res) => {
    const forms = await StudentExamForm.find({ studentId: req.params.studentId }).populate('sessionId');
    res.json(forms);
});

// ==========================================
// 5. RESULTS
// ==========================================

router.post('/upload-marks', async (req, res) => {
  try {
    const { batch, semester, subjectCode, results } = req.body;
    const ops = results.map(r => ({
      updateOne: {
        filter: { batch, semester, subjectCode, studentRollNo: r.rollNo },
        update: { $set: { marksObtained: r.marks, totalMarks: r.total, isPublished: false } },
        upsert: true
      }
    }));
    await ExamResult.bulkWrite(ops);
    res.json({ message: 'Marks uploaded' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/publish-results', async (req, res) => {
    await ExamResult.updateMany({ batch: req.body.batch, semester: req.body.semester }, { isPublished: true });
    res.json({ success: true });
});

router.get('/results/:rollNo', async (req, res) => {
    const results = await ExamResult.find({ studentRollNo: req.params.rollNo, isPublished: true });
    res.json(results);
});

// ==========================================
// 6. ADMIN REPORTS (New Section)
// ==========================================

// GET ALL EXAM FEE RECORDS (Real DB Data)
router.get('/admin/exam-forms', async (req, res) => {
    try {
        // Fetch all PAID forms sorted by newest
        const forms = await StudentExamForm.find({ 
            tenantId: req.tenant.id,
            paymentStatus: 'Paid' 
        })
        .populate('sessionId', 'sessionName year') // Get Session Name
        .select('studentName rollNo course feeBreakdown paymentStatus createdAt')
        .sort({ createdAt: -1 });

        res.json(forms);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET ALL SEMESTER FEE RECORDS (Real DB Data)
// Note: Since 'SemesterFee' model wasn't provided, this is a placeholder 
// that returns an empty array from the DB or you can link your Accounts model here.
router.get('/admin/semester-fees', async (req, res) => {
    try {
        // Example: const fees = await SemesterFee.find({ tenantId: req.tenant.id, status: 'Paid' });
        // For now, returning empty array to satisfy "No Mock Data" rule (Real API response)
        res.json([]); 
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});


// ==========================================
// 7. EXAM MANAGEMENT (ADMIN)
// ==========================================

// A. GET COMPREHENSIVE EXAM STATUS (Submitted vs Pending)
router.get('/admin/exam-status', async (req, res) => {
    try {
        // 1. Get Active Session
        const session = await ExamSession.findOne({ tenantId: req.tenant.id, isActive: true });
        if (!session) return res.json({ session: null, records: [] });

        // 2. Get All Active Students
        // Optimization: In production, filter this by Batches relevant to the Exam Cycle
        const students = await StudentProfile.find({ tenantId: req.tenant.id })
            .populate('userId', 'name email')
            .select('userId rollNo course currentSemester batchId');

        // 3. Get All Submitted Forms for this Session
        const forms = await StudentExamForm.find({ 
            tenantId: req.tenant.id, 
            sessionId: session._id 
        });

        // 4. Create Lookup Map for Forms
        const formMap = new Map();
        forms.forEach(f => formMap.set(f.studentId.toString(), f));

        // 5. Merge Data
        const report = students.map(student => {
            const form = formMap.get(student.userId._id.toString());
            return {
                studentId: student.userId._id,
                name: student.userId.name,
                rollNo: student.rollNo,
                course: student.course || student.stream,
                semester: student.currentSemester,
                status: form ? 'Submitted' : 'Pending',
                formId: form ? form._id : null,
                paymentStatus: form ? form.paymentStatus : 'N/A',
                submissionDate: form ? form.createdAt : null
            };
        });

        res.json({ session, records: report });

    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// B. RESET EXAM FORM (Delete submission so student can fill again)
router.delete('/admin/reset-form/:formId', async (req, res) => {
    try {
        await StudentExamForm.findByIdAndDelete(req.params.formId);
        res.json({ success: true, message: "Exam form reset successfully. Student can now re-apply." });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ==========================================
// 8. SEMESTER FEEDBACK DATA
// ==========================================
router.get('/student/feedback-data/:userId', async (req, res) => {
    try {
        // 1. Fetch Student Profile with Batch and Department
        const profile = await StudentProfile.findOne({ 
            userId: req.params.userId, 
            tenantId: req.tenant.id 
        })
        .populate('userId', 'name email')
        .populate({
            path: 'batchId',
            populate: { path: 'departmentId' }
        });

        if (!profile) return res.status(404).json({ error: "Student profile not found" });

        // 2. Extract specific details
        const batch = profile.batchId;
        const dept = batch?.departmentId;
        const currentSem = batch?.currentTerm || profile.currentSemester || 1;

        // 3. Fetch all subjects for this department up to the student's current semester
        let subjects = [];
        if (dept) {
            subjects = await Subject.find({
                departmentId: dept._id,
                semester: { $lte: currentSem },
                isActive: true
            }).select('name code type credits semester');
        }

        // 4. Return aggregated data
        res.json({
            profile: {
                name: profile.userId.name,
                uid: profile.uid, // Noteloom ID
                rollNo: profile.rollNo,
                course: profile.course || "B.Tech",
                stream: dept?.name || profile.stream || "General",
                batch: batch?.batchName || "Unassigned Batch",
                currentSemester: currentSem
            },
            subjects: subjects
        });

    } catch (e) {
        console.error("Feedback Data Fetch Error:", e);
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;