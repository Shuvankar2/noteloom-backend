const express = require('express');
const router = express.Router();
const lmsController = require('../controllers/lmsController');
const { setTenantContext } = require('../middleware/authMiddleware');
const { uploadCloud } = require('../config/cloudinary');

router.use(setTenantContext);

// --- SUBJECTS ---
router.get('/all-subjects', lmsController.getAllSubjects);

// --- MODULES ---
router.get('/classrooms/:id/modules', lmsController.getModules);
router.post('/classrooms/:id/modules', lmsController.createModule);

// --- CONTENT & PROGRESS ---
router.get('/modules/:moduleId/content', lmsController.getModuleContent);
router.post('/modules/:moduleId/content', uploadCloud.array('files'), lmsController.uploadContent);
router.get('/content/:id', lmsController.getContentDetail);
router.put('/content/:id/toggle-download', lmsController.toggleDownload);
router.post('/content/:id/complete', lmsController.markComplete);
router.delete('/content/:id', lmsController.deleteContent);

module.exports = router;