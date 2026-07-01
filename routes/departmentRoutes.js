const express = require('express');
const router = express.Router();
const academicController = require('../controllers/academicController');
const { setTenantContext } = require('../middleware/authMiddleware');

router.use(setTenantContext);

// --- DEPARTMENTS ---
router.get('/', academicController.getDepartments);
router.post('/', academicController.createDepartment);
router.put('/:id', academicController.updateDepartment);
router.delete('/:id', academicController.deleteDepartment);

// --- STREAMS ---
router.post('/:id/streams', academicController.createStream);
router.put('/:deptId/streams/:streamId/config', academicController.configStream);
router.delete('/:id/streams/:streamId', academicController.deleteStream);

// --- SUBJECTS ---
router.get('/:deptId/subjects', academicController.getSubjects);
router.post('/:deptId/subjects', academicController.createSubject);
router.put('/subjects/:id', academicController.updateSubject);
router.delete('/subjects/:id', academicController.deleteSubject);

// --- OVERVIEW ---
router.get('/:id/overview', academicController.getDepartmentOverview);

module.exports = router;