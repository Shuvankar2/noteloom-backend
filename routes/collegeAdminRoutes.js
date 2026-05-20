const express = require('express');
const router = express.Router();

// Import Models
const User = require('../models/User'); 
const CollegeAdminRequest = require('../models/CollegeAdminRequest');
const FacultyProfile = require('../models/FacultyProfile');
const StudentProfile = require('../models/StudentProfile');
const AdminProfile = require('../models/AdminProfile'); // 🟢 ADDED THIS IMPORT
const Membership = require('../models/Membership'); 

// -----------------------------------------------------------
// 1. Get All Requests (Existing)
// -----------------------------------------------------------
router.get('/requests', async (req, res) => {
  try {
    const requests = await CollegeAdminRequest.find();
    res.json(requests);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch requests' });
  }
});

// -----------------------------------------------------------
// 2. Approve or Reject Request (Existing)
// -----------------------------------------------------------
router.post('/requests/:id/:action', async (req, res) => {
  try {
    const { id, action } = req.params;
    const request = await CollegeAdminRequest.findById(id);

    if (!request) return res.status(404).json({ error: 'Request not found' });

    if (action === 'approve') {
      await User.findByIdAndUpdate(request.userId, { role: request.role });

      if (request.role === 'faculty') {
        await FacultyProfile.create({
          userId: request.userId,
          name: request.name,
          email: request.email,
          department: request.department
        });
      } else if (request.role === 'student') {
        await StudentProfile.create({
          userId: request.userId,
          name: request.name,
          email: request.email,
          department: request.department,
          year: request.year
        });
      }
    }
    await CollegeAdminRequest.findByIdAndDelete(id);
    res.json({ message: `Request ${action}ed successfully` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to process request' });
  }
});

// -----------------------------------------------------------
// 3. User Management Routes (✅ UPDATED TO FIX IDS)
// -----------------------------------------------------------

// GET Users by Role (e.g., /users/student)
router.get('/users/:role', async (req, res) => {
  try {
    const { role } = req.params;
    
    // 1. Find memberships for this specific college (tenant) and role
    const memberships = await Membership.find({
      tenantId: req.tenant.id,
      role: role
    }).populate('userId'); // Get user details from User model

    // 2. Extract User IDs to bulk-fetch profiles
    const validMemberships = memberships.filter(m => m.userId); // Filter out deleted users
    const userIds = validMemberships.map(m => m.userId._id);

    // 3. Fetch the corresponding Profiles to get the real IDs (UID/RollNo)
    let profiles = [];
    
    // 🟢 FIX: Added logic for 'college_admin'
    if (role === 'student') {
        profiles = await StudentProfile.find({ userId: { $in: userIds } });
    } else if (role === 'faculty') {
        profiles = await FacultyProfile.find({ userId: { $in: userIds } });
    } else if (role === 'college_admin') {
        profiles = await AdminProfile.find({ userId: { $in: userIds } });
    }

    // 4. Map the data merging User + Profile info
    const users = validMemberships.map(m => {
        const u = m.userId.toObject();
        
        // Find matching profile
        const profile = profiles.find(p => p.userId.toString() === u._id.toString());
        
        // DETERMINE THE CORRECT ID TO SHOW
        // Check Profile fields first (uid, rollNo, employeeId), fall back to User.noteloomId
        let displayUid = 'N/A';
        if (profile) {
            displayUid = profile.uid || profile.rollNo || profile.employeeId || profile.enrollmentId || 'N/A';
        } else if (u.noteloomId) {
            displayUid = u.noteloomId;
        }

        return {
          _id: u._id,
          name: u.name,
          email: u.email,
          uid: displayUid,  // ✅ Now sends the actual ID from the profile
          status: m.status,
          createdAt: u.createdAt,
          deletionScheduledAt: u.deletionScheduledAt
        };
      });

    res.json(users);
  } catch (error) {
    console.error("Fetch Users Error:", error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// TOGGLE STATUS (Enable/Disable Account)
router.patch('/users/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    // Update Membership status specific to this college
    await Membership.findOneAndUpdate(
      { userId: req.params.id, tenantId: req.tenant.id },
      { status: status }
    );
    res.json({ message: 'Status updated' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// DELETE USER (Schedule Deletion)
router.delete('/users/:id', async (req, res) => {
  try {
    // 1. Schedule soft delete on User
    await User.findByIdAndUpdate(req.params.id, { 
        deletionScheduledAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 Days
    });
    
    // 2. Suspend access immediately
    await Membership.findOneAndUpdate(
      { userId: req.params.id, tenantId: req.tenant.id },
      { status: 'suspended' }
    );
    
    res.json({ message: 'User scheduled for deletion' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

module.exports = router;