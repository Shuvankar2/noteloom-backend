const { v4: uuidv4 } = require('uuid');
const LeaveApplication = require('../models/LeaveApplication');
const User = require('../models/User');

// 1. FACULTY: Apply for Leave
exports.applyLeave = async (req, res) => {
    try {
        const userId = req.user.id;
        const { leaveType, startDate, endDate, reason } = req.body;
        
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
};

// 2. FACULTY: Get History (Last 1 Year)
exports.getLeaveHistory = async (req, res) => {
    try {
        const targetUserId = req.params.userId;
        
        // Security check: Users can only view their own leave history unless they are college admin
        if (req.role !== 'college_admin' && req.user.id !== targetUserId) {
            return res.status(403).json({ error: "Unauthorized access to leave history" });
        }

        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

        const history = await LeaveApplication.find({
            user: targetUserId,
            createdAt: { $gte: oneYearAgo }
        }).sort({ createdAt: -1 });

        res.json(history);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// 3. ADMIN: Get All Requests (Search/Filter)
exports.getAdminLeaveRequests = async (req, res) => {
    try {
        // Security check: Only admins can view all requests
        if (req.role !== 'college_admin') {
            return res.status(403).json({ error: "Access denied. Admins only." });
        }

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
            // Query 'name' directly (virtual 'fullName' is not searchable in MongoDB)
            const users = await User.find({ name: searchRegex }).select('_id');
            const userIds = users.map(u => u._id);
            
            query.$or = [
                { leaveAppId: searchRegex }, // Match Barcode ID
                { user: { $in: userIds } }   // Match Name
            ];
        }

        const requests = await LeaveApplication.find(query)
            .populate('user', 'name department email') // Mongoose maps Virtual 'fullName' automatically on output
            .sort({ createdAt: -1 });

        res.json(requests);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// 4. ADMIN: Action (Approve/Decline)
exports.actionLeaveRequest = async (req, res) => {
    try {
        // Security check: Only admins can action requests
        if (req.role !== 'college_admin') {
            return res.status(403).json({ error: "Access denied. Admins only." });
        }

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
};
