const express = require('express');
const router = express.Router();
const academicController = require('../controllers/academicController');
const { setTenantContext } = require('../middleware/authMiddleware');

router.use(setTenantContext);

router.post('/', academicController.createBatch);
router.get('/', academicController.getBatches);
router.post('/:batchId/enroll', academicController.enrollStudent);
router.get('/my-batches', academicController.getMyBatches);
router.get('/:batchId/students', academicController.getBatchStudents);
router.delete('/:id', academicController.deleteBatch);

module.exports = router;