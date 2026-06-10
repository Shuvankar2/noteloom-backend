const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const LeaveApplication = require('../models/LeaveApplication');
const User = require('../models/User'); // Assuming you have a User model file
const FacultyProfile = require('../models/FacultyProfile');
const StudentProfile = require('../models/StudentProfile');
const { setTenantContext } = require('../middleware/authMiddleware');

router.use(setTenantContext);


// Middleware to verify token (You likely already have this, reuse it)
// If not, pass your existing 'authenticateToken' middleware here

// 1. FACULTY: Apply for Leave
router.post('/apply', async (req, res) => {
    try {
        const { userId, leaveType, startDate, endDate, reason } = req.body;
        
        // Fetch user to get current department
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: "User not found" });

        // Generate Short Unique ID (e.g., LEV-A1B2)
        const shortId = 'LEV-' + uuidv4().split('-')[0].toUpperCase().substring(0, 6);

        const newLeave = new LeaveApplication({
            leaveAppId: shortId,
            user: userId,
            department: user.department || 'General', 
            leaveType,
            startDate,
            endDate,
            reason
        });

        await newLeave.save();
        res.status(201).json(newLeave);
    } catch (error) {
        res.status(500).json({ message: "Error applying", error: error.message });
    }
});

// 2. FACULTY: Get History (Last 1 Year)
router.get('/history/:userId', async (req, res) => {
    try {
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

        const history = await LeaveApplication.find({
            user: req.params.userId,
            createdAt: { $gte: oneYearAgo }
        }).sort({ createdAt: -1 });

        res.json(history);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 3. ADMIN: Get All Requests (Search/Filter)
router.get('/admin/requests', async (req, res) => {
    try {
        const { status, dept, search } = req.query;
        let query = {};
        
        // 1 Year Limit
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        query.createdAt = { $gte: oneYearAgo };

        if (status && status !== 'All') query.status = status;
        if (dept && dept !== 'All') query.department = dept;

        // Search logic (ID or User Name)
        if (search) {
            const searchRegex = new RegExp(search, 'i');
            // Find users matching name
            const users = await User.find({ name: searchRegex }).select('_id');
            const userIds = users.map(u => u._id);
            
            query.$or = [
                { leaveAppId: searchRegex }, // Match Barcode ID
                { user: { $in: userIds } }   // Match Name
            ];
        }

        const requests = await LeaveApplication.find(query)
            .populate('user', 'name department noteloomId')
            .sort({ createdAt: -1 });

        res.json(requests);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 4. ADMIN: Action (Approve/Decline)
router.put('/admin/action/:id', async (req, res) => {
    try {
        const { status, remarks } = req.body;
        const updated = await LeaveApplication.findByIdAndUpdate(
            req.params.id, 
            { status, adminRemarks: remarks },
            { new: true }
        );
        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;