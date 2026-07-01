const express = require('express');
const router = express.Router();
const academicController = require('../controllers/academicController');
const { setTenantContext } = require('../middleware/authMiddleware');

router.use(setTenantContext);

router.get('/', academicController.getClassrooms);
router.post('/', academicController.createClassroom);
router.post('/:id/enroll', academicController.enrollUserInClass);
router.delete('/:id/unenroll', academicController.unenrollFromClass);
router.delete('/:id', academicController.deleteClassroom);

module.exports = router;