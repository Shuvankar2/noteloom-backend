const express = require('express');
const router = express.Router();
const coeController = require('../controllers/coeController');
const questionBankController = require('../controllers/questionBankController');
const admitCardController = require('../controllers/admitCardController');

const { setTenantContext } = require('../middleware/authMiddleware');
const { uploadCloud } = require('../config/cloudinary');

// Apply setTenantContext to all routes
router.use(setTenantContext);

// --- A. SESSION MANAGEMENT (ADMIN) ---
router.get('/sessions/all', coeController.getAllSessions);
router.post('/session', coeController.createSession);
router.put('/session/:id', coeController.updateSession);

// --- B. STUDENT EXAM PORTAL ---
router.get('/student/eligibility/:studentId', coeController.checkEligibility);
router.post('/student/submit-form', coeController.submitForm);

// --- C. ALLOCATIONS ---
router.get('/allocation/student/:studentId', coeController.getAllocationsForStudent);
router.get('/allocation/batch/:batchId', coeController.getAllocationsForBatch);
router.post('/allocation', coeController.saveAllocations);

// --- D. QUESTION BANK ---
router.post('/upload-question', uploadCloud.single('file'), questionBankController.uploadQuestion);
router.get('/questions', questionBankController.getQuestions);
router.delete('/question/:id', questionBankController.deleteQuestion);

// --- E. EXAM SESSIONS ---
router.get('/active-session', coeController.getActiveSession);

// --- F. EXAM FORMS ---
router.post('/submit-exam-form', coeController.submitExamForm);
router.get('/my-forms/:studentId', coeController.getMyForms);

// --- G. RESULTS ---
router.post('/upload-marks', coeController.uploadMarks);
router.post('/publish-results', coeController.publishResults);
router.get('/results/:rollNo', coeController.getResults);

// --- H. ADMIN REPORTS ---
router.get('/admin/exam-forms', coeController.getExamForms);
router.get('/admin/semester-fees', coeController.getSemesterFees);

// --- I. EXAM MANAGEMENT ---
router.get('/admin/exam-status', coeController.getExamStatus);
router.delete('/admin/reset-form/:formId', coeController.resetExamForm);

// --- J. SEMESTER FEEDBACK DATA ---
router.get('/student/feedback-data/:userId', coeController.getFeedbackData);

// --- K. ADMIT CARD ---
router.get('/admit-card/:studentUserId', admitCardController.getAdmitCardDashboard);

module.exports = router;