const express = require('express');
const router = express.Router();
const itAdminController = require('../controllers/itAdminController');
const { setITContext } = require('../middleware/authMiddleware');
const validate = require('../middleware/validateMiddleware');
const { signinSchema } = require('../utils/validators');

// ==========================================
// PUBLIC ROUTES
// ==========================================
router.get('/public/colleges', itAdminController.getPublicColleges);
router.post('/login', validate(signinSchema), itAdminController.login);
router.post('/signout', itAdminController.signout);

// ==========================================
// PROTECTED ROUTES (Requires IT context)
// ==========================================
router.use(setITContext);

// Colleges
router.get('/colleges', itAdminController.getColleges);
router.post('/colleges', itAdminController.createCollege);
router.patch('/colleges/:id/status', itAdminController.updateCollegeStatus);
router.delete('/colleges/:id', itAdminController.deleteCollege);
router.put('/colleges/:id', itAdminController.updateCollege);

// Requests & Users
router.get('/college-requests', itAdminController.getCollegeRequests);
router.get('/manager-requests', itAdminController.getManagerRequests);
router.get('/users', itAdminController.getUsers);
router.get('/tenants-list', itAdminController.getTenantsList);

// Feature Configuration
router.get('/menu-config/:tenantId', itAdminController.getMenuConfig);
router.post('/menu-config', itAdminController.saveMenuConfig);

module.exports = router;