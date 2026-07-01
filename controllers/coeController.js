const ExamSession = require('../models/ExamSession');
const StudentExamForm = require('../models/StudentExamForm');
const ExamResult = require('../models/ExamResult');
const StudentProfile = require('../models/StudentProfile');
const Subject = require('../models/Subject');
const { StudentSubjectMap } = require('../models/COE_Extended');

// 1. GET ALL SESSIONS
exports.getAllSessions = async (req, res) => {
    try {
        const sessions = await ExamSession.find({ tenantId: req.tenant.id })
            .sort({ createdAt: -1 });
        res.json(sessions);
    } catch (e) { res.status(500).json({ error: e.message }); }
};

// 2. CREATE NEW SESSION
exports.createSession = async (req, res) => {
    try {
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
};

// 3. MANAGE EXISTING SESSION
exports.updateSession = async (req, res) => {
    try {
        const { action, updates } = req.body; 
        
        if (action === 'activate') {
            await ExamSession.updateMany({ tenantId: req.tenant.id }, { isActive: false });
            const session = await ExamSession.findByIdAndUpdate(req.params.id, { isActive: true }, { new: true });
            return res.json(session);
        }
        
        let updateData = {};
        if (action === 'deactivate') updateData = { isActive: false };
        else if (action === 'archive') updateData = { isActive: false, isArchived: true }; 
        else if (action === 'edit') updateData = updates;

        const session = await ExamSession.findByIdAndUpdate(req.params.id, updateData, { new: true });
        res.json(session);
    } catch (e) { res.status(500).json({ error: e.message }); }
};

// 4. CHECK ELIGIBILITY
exports.checkEligibility = async (req, res) => {
    try {
        const session = await ExamSession.findOne({ tenantId: req.tenant.id, isActive: true });
        if (!session) return res.json({ eligible: false, error: "No active examination session found." });

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
        
        const currentSem = batch.currentTerm || profile.currentSemester; 
        const isOddSem = currentSem % 2 !== 0;

        if (session.cycle !== 'Both') {
            if (session.cycle === 'Odd' && !isOddSem) {
                return res.json({ eligible: false, error: `Session is for Odd terms. You are in Term ${currentSem} (Even).` });
            }
            if (session.cycle === 'Even' && isOddSem) {
                return res.json({ eligible: false, error: `Session is for Even terms. You are in Term ${currentSem} (Odd).` });
            }
        }
        
        const regularSubjectsRaw = await Subject.find({
            departmentId: dept._id,
            semester: currentSem,
            isActive: true
        }).select('name code type credits semester');

        const previousSubjects = await Subject.find({
            departmentId: dept._id,
            semester: { $lt: currentSem },
            isActive: true
        }).select('name code type credits semester');

        const passedResults = await ExamResult.find({
            studentRollNo: profile.rollNo,
            marksObtained: { $gte: 40 } 
        }).select('subjectCode');

        const passedCodes = new Set(passedResults.map(r => r.subjectCode));

        const backlogSubjectsRaw = previousSubjects.filter(sub => {
            return !passedCodes.has(sub.code);
        });

        const existingForm = await StudentExamForm.findOne({ 
            studentId: req.params.studentId, 
            sessionId: session._id,
            paymentStatus: 'Paid'
        });

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
                program: "B.Tech",
                stream: dept.name,
                batch: batch.batchName,
                currentSem: currentSem
            },
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
};

// 5. SUBMIT FORM (STUDENT)
exports.submitForm = async (req, res) => {
    try {
        const { studentId, sessionId, regularSubjects, backlogSubjects, studentDetails } = req.body;
        
        const form = new StudentExamForm({
            tenantId: req.tenant.id,
            sessionId,
            studentId,
            studentName: studentDetails.name,
            rollNo: studentDetails.rollNo,
            verifiedSubjects: [
                ...regularSubjects.map(s => ({ name: s.title, code: s.code })),
                ...backlogSubjects.map(s => ({ name: s.name, code: s.code }))
            ],
            paymentStatus: 'Paid',
            admitCardGenerated: true
        });

        await form.save();
        res.json({ success: true, formId: form._id });
    } catch (e) { res.status(500).json({ error: e.message }); }
};

// 6. ALLOCATION: GET BY STUDENT
exports.getAllocationsForStudent = async (req, res) => {
  try {
    const maps = await StudentSubjectMap.find({ 
      studentId: req.params.studentId,
      tenantId: req.tenant.id 
    }).populate('subjects');
    
    const grouped = {};
    maps.forEach(m => {
        if (!grouped[m.semester]) grouped[m.semester] = [];
        grouped[m.semester] = m.subjects;
    });

    res.json(grouped);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// 7. ALLOCATION: GET BY BATCH
exports.getAllocationsForBatch = async (req, res) => {
  try {
    const maps = await StudentSubjectMap.find({ 
      batchId: req.params.batchId,
      tenantId: req.tenant.id 
    });
    res.json(maps);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// 8. ALLOCATION: SAVE
exports.saveAllocations = async (req, res) => {
  try {
    const { mappings, batchId } = req.body; 

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
            subjects: map.subjects
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
};

// 9. GET ACTIVE SESSION
exports.getActiveSession = async (req, res) => {
  try {
    const session = await ExamSession.findOne({ tenantId: req.tenant.id, isActive: true });
    res.json(session);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// 10. SUBMIT EXAM FORM (GENERIC)
exports.submitExamForm = async (req, res) => {
  try {
    const form = new StudentExamForm(req.body);
    await form.save();
    res.json({ success: true, formId: form._id });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// 11. GET MY FORMS
exports.getMyForms = async (req, res) => {
    const forms = await StudentExamForm.find({ studentId: req.params.studentId }).populate('sessionId');
    res.json(forms);
};

// 12. UPLOAD MARKS
exports.uploadMarks = async (req, res) => {
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
};

// 13. PUBLISH RESULTS
exports.publishResults = async (req, res) => {
    await ExamResult.updateMany({ batch: req.body.batch, semester: req.body.semester }, { isPublished: true });
    res.json({ success: true });
};

// 14. GET RESULTS
exports.getResults = async (req, res) => {
    const results = await ExamResult.find({ studentRollNo: req.params.rollNo, isPublished: true });
    res.json(results);
};

// 15. GET EXAM FORMS (ADMIN)
exports.getExamForms = async (req, res) => {
    try {
        const forms = await StudentExamForm.find({ 
            tenantId: req.tenant.id,
            paymentStatus: 'Paid' 
        })
        .populate('sessionId', 'sessionName year') 
        .select('studentName rollNo course feeBreakdown paymentStatus createdAt')
        .sort({ createdAt: -1 });

        res.json(forms);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// 16. GET SEMESTER FEES (ADMIN)
exports.getSemesterFees = async (req, res) => {
    try {
        const forms = await StudentExamForm.find({ 
            tenantId: req.tenant.id,
            paymentStatus: 'Paid' 
        })
        .populate('sessionId', 'sessionName year')
        .sort({ createdAt: -1 });

        const records = forms.map(f => ({
            _id: f._id,
            studentName: f.studentName || 'N/A',
            rollNo: f.rollNo,
            sessionName: f.sessionId?.sessionName || 'N/A',
            course: f.course,
            term: f.currentTerm || 1,
            regularFee: f.feeBreakdown?.regularFee || 0,
            backlogFee: f.feeBreakdown?.backlogFee || 0,
            totalPaid: f.feeBreakdown?.totalPaid || 0,
            transactionId: f.feeBreakdown?.transactionId || 'N/A',
            date: f.submittedAt || f.createdAt
        }));

        res.json(records); 
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// 17. GET EXAM STATUS (ADMIN)
exports.getExamStatus = async (req, res) => {
    try {
        const session = await ExamSession.findOne({ tenantId: req.tenant.id, isActive: true });
        if (!session) return res.json({ session: null, records: [] });

        const students = await StudentProfile.find({ tenantId: req.tenant.id })
            .populate('userId', 'name email')
            .select('userId rollNo course currentSemester batchId');

        const forms = await StudentExamForm.find({ 
            tenantId: req.tenant.id, 
            sessionId: session._id 
        });

        const formMap = new Map();
        forms.forEach(f => formMap.set(f.studentId.toString(), f));

        const report = students.map(student => {
            const form = formMap.get(student.userId?._id?.toString() || '');
            return {
                studentId: student.userId?._id || null,
                name: student.userId?.name || 'N/A',
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
};

// 18. RESET EXAM FORM
exports.resetExamForm = async (req, res) => {
    try {
        await StudentExamForm.findByIdAndDelete(req.params.formId);
        res.json({ success: true, message: "Exam form reset successfully. Student can now re-apply." });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// 19. GET STUDENT FEEDBACK DATA
exports.getFeedbackData = async (req, res) => {
    try {
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

        const batch = profile.batchId;
        const dept = batch?.departmentId;
        const currentSem = batch?.currentTerm || profile.currentSemester || 1;

        let subjects = [];
        if (dept) {
            subjects = await Subject.find({
                departmentId: dept._id,
                semester: { $lte: currentSem },
                isActive: true
            }).select('name code type credits semester');
        }

        res.json({
            profile: {
                name: profile.userId?.name || 'N/A',
                uid: profile.uid, 
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
};
