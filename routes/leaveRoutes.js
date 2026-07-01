const express = require('express');
const router = express.Router();
const leaveController = require('../controllers/leaveController');
const { setTenantContext } = require('../middleware/authMiddleware');
const validate = require('../middleware/validateMiddleware');
const { leaveSchema } = require('../utils/validators');

// Apply auth middleware to all leave routes
router.use(setTenantContext);

// 1. FACULTY: Apply for Leave
router.post('/apply', validate(leaveSchema), leaveController.applyLeave);

// 2. FACULTY: Get History (Last 1 Year)
router.get('/history/:userId', leaveController.getLeaveHistory);

// 3. ADMIN: Get All Requests (Search/Filter)
router.get('/admin/requests', leaveController.getAdminLeaveRequests);

// 4. ADMIN: Action (Approve/Decline)
router.put('/admin/action/:id', leaveController.actionLeaveRequest);

module.exports = router;