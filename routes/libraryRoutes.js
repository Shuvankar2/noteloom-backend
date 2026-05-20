const express = require('express');
const router = express.Router();
const { LibraryCredential, DigitalResource, PhysicalBook } = require('../models/Library');
const User = require('../models/User'); 
const Membership = require('../models/Membership');
const { setTenantContext } = require('../middleware/authMiddleware'); 

// [NEW] Import Profiles to search by UID/RollNo
const StudentProfile = require('../models/StudentProfile');
const FacultyProfile = require('../models/FacultyProfile');
const AdminProfile = require('../models/AdminProfile');

// ==========================================
// 1. DIGITAL LIBRARY ROUTES
// ==========================================

// GET: Fetch Resources (With Permission Logic)
router.get('/digital', setTenantContext, async (req, res) => {
  try {
    const tenantId = req.tenant.id; 
    const credentials = await LibraryCredential.find({ tenantId });
    
    // Default Query: Current Tenant
    let query = { tenantId };

    // [NEW] Visibility Logic
    // If NOT Admin, show only 'Approved' resources OR resources uploaded by the user themselves
    if (req.role !== 'college_admin') {
        query.$or = [
            { status: 'Approved' },
            { addedBy: req.user.id } // Users can track their own pending uploads
        ];
    }
    // Admins see everything (Pending & Approved)

    const resources = await DigitalResource.find(query)
        .populate('addedBy', 'name role') // Useful to see who uploaded pending items
        .sort({ createdAt: -1 });
    
    res.json({ credentials, resources });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error fetching digital library data' });
  }
});

// POST: Add Resource (Handle Pending Logic)
router.post('/digital/resource', setTenantContext, async (req, res) => {
  try {
    const { title, author, department, course, type, url, description, semester } = req.body;
    
    // [MODIFIED] Logic: Faculty uploads are Pending. Admin & Students (Users) are Auto-Approved.
    // This ensures user content is available to all immediately, while faculty content requires admin approval.
    const initialStatus = req.role === 'faculty' ? 'Pending' : 'Approved';

    const newResource = new DigitalResource({
      tenantId: req.tenant.id,
      title,
      author,
      department,
      course, 
      type,
      url,
      description,
      semester,
      status: initialStatus, // Status is set based on the logic above
      addedBy: req.user.id
    });

    await newResource.save();
    res.status(201).json(newResource);
  } catch (err) {
    console.error("Resource Upload Error:", err);
    res.status(500).json({ error: err.message || 'Failed to add resource' });
  }
});

// [NEW] PUT: Approve/Reject Resource (Admin Only)
router.put('/digital/resource/:id/status', setTenantContext, async (req, res) => {
    try {
        if (req.role !== 'college_admin') return res.status(403).json({ error: "Unauthorized" });
        
        const { status } = req.body; // Expecting 'Approved' or 'Rejected'
        
        const resource = await DigitalResource.findOneAndUpdate(
            { _id: req.params.id, tenantId: req.tenant.id },
            { status },
            { new: true }
        );
        
        if (!resource) return res.status(404).json({ error: "Resource not found" });
        
        res.json(resource);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Update failed" });
    }
});

// PUT: Update/Add Institutional Credentials (Admin Only)
router.put('/digital/credential', setTenantContext, async (req, res) => {
  try {
    if (req.role !== 'college_admin') {
      return res.status(403).json({ error: 'Access denied. Admins only.' });
    }
    
    // Extract 'link' from the request body
    const { _id, providerName, loginId, password, note, link } = req.body;
    
    let credential;
    if (_id) {
      // Update existing credential
      credential = await LibraryCredential.findOneAndUpdate(
        { _id, tenantId: req.tenant.id },
        { providerName, loginId, password, note, link }, // <--- Add 'link' here
        { new: true }
      );
    } else {
      // Create new credential
      credential = new LibraryCredential({ 
        tenantId: req.tenant.id, 
        providerName, 
        loginId, 
        password, 
        note, 
        link // <--- Add 'link' here
      });
      await credential.save();
    }
    res.json(credential);
  } catch (err) { 
    console.error(err);
    res.status(500).json({ error: 'Failed to save credential' }); 
  }
});

// DELETE: Delete Credential
router.delete('/digital/credential/:id', setTenantContext, async (req, res) => {
    try {
      if (req.role !== 'college_admin') return res.status(403).json({ error: 'Unauthorized' });
      await LibraryCredential.findOneAndDelete({ _id: req.params.id, tenantId: req.tenant.id });
      res.json({ message: 'Deleted' });
    } catch (err) { res.status(500).json({ error: 'Delete failed' }); }
});

// ==========================================
// 2. PHYSICAL LIBRARY ROUTES
// ==========================================

router.get('/physical', setTenantContext, async (req, res) => {
  try {
    const books = await PhysicalBook
      .find({ tenantId: req.tenant.id })
      .sort({ title: 1 });

    res.json(books);
  } catch (err) {
    console.error("Physical fetch error:", err);
    res.status(500).json({ error: 'Failed to fetch inventory' });
  }
});

// [UPDATED] GET: Fetch User Details, Profile UID, Picture & Active Holdings
router.get('/physical/user/:identifier', setTenantContext, async (req, res) => {
    try {
        if (req.role !== 'college_admin') return res.status(403).json({ error: 'Unauthorized' });

        const { identifier } = req.params;

        // 1. Find User (Email, NoteLoom ID, or Profile UID)
        let user = await User.findOne({ 
            $or: [ { email: identifier }, { noteloomId: identifier } ] 
        });

        // If not found in User collection, search Profiles
        if (!user) {
            const [studentP, facultyP, adminP] = await Promise.all([
                StudentProfile.findOne({ tenantId: req.tenant.id, $or: [{ uid: identifier }, { rollNo: identifier }] }),
                FacultyProfile.findOne({ tenantId: req.tenant.id, $or: [{ uid: identifier }, { employeeId: identifier }] }),
                AdminProfile.findOne({ tenantId: req.tenant.id, $or: [{ uid: identifier }, { employeeId: identifier }] })
            ]);
            const profile = studentP || facultyP || adminP;
            if (profile) user = await User.findById(profile.userId);
        }

        if (!user) return res.status(404).json({ error: 'User not found' });

        // 2. Get Membership (Role)
        const membership = await Membership.findOne({ userId: user._id, tenantId: req.tenant.id });
        if (!membership) return res.status(403).json({ error: 'User is not a member' });

        // 3. [UPDATED] Fetch Profile to get ID (UID/RollNo) AND Profile Picture
        let profileUid = null;
        let profilePic = null; // Default to null (triggers gradient fallback in frontend)

        if (membership.role === 'student') {
            const p = await StudentProfile.findOne({ userId: user._id, tenantId: req.tenant.id });
            if (p) {
                profileUid = p.uid || p.rollNo;
                profilePic = p.profilePicture; // Sends URL if exists
            }
        } else if (membership.role === 'faculty') {
            const p = await FacultyProfile.findOne({ userId: user._id, tenantId: req.tenant.id });
            if (p) {
                profileUid = p.uid || p.employeeId;
                // Note: Ensure your FacultyProfile schema has 'profilePicture' field if you want to support images for them
                profilePic = p.profilePicture; 
            }
        } else if (membership.role === 'college_admin') {
            const p = await AdminProfile.findOne({ userId: user._id, tenantId: req.tenant.id });
            if (p) {
                profileUid = p.uid || p.employeeId;
                profilePic = p.profilePicture;
            }
        }

        // 4. Find Active Loans
        const activeLoans = await PhysicalBook.find({
            tenantId: req.tenant.id,
            "copies": {
                $elemMatch: {
                    "issuedTo.userId": user._id,
                    "status": "Issued"
                }
            }
        });

        const holdings = [];
        activeLoans.forEach(book => {
            book.copies.forEach(copy => {
                if (copy.issuedTo && copy.issuedTo.userId && 
                    copy.issuedTo.userId.toString() === user._id.toString() && 
                    copy.status === 'Issued') {
                    
                    holdings.push({
                        title: book.title,
                        copyId: copy.copyId,
                        issuedDate: copy.issuedDate,
                        dueDate: copy.dueDate
                    });
                }
            });
        });

        res.json({
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: membership.role,
                noteloomId: profileUid || user.noteloomId || 'N/A',
                profilePicture: profilePic // [IMPORTANT] Sent to frontend
            },
            holdings
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Lookup failed' });
    }
});

// [NEW] GET: Fetch Copy Details (For Return Search Panel)
router.get('/physical/copy/:copyId', setTenantContext, async (req, res) => {
    try {
        if (req.role !== 'college_admin') return res.status(403).json({ error: 'Unauthorized' });

        const book = await PhysicalBook.findOne({
            tenantId: req.tenant.id,
            "copies.copyId": req.params.copyId
        });

        if (!book) return res.status(404).json({ error: 'Copy ID not found' });

        const copy = book.copies.find(c => c.copyId === req.params.copyId);

        res.json({
            title: book.title,
            author: book.author,
            copyId: copy.copyId,
            status: copy.status,
            issuedTo: copy.issuedTo // Includes name/email if issued
        });
    } catch (err) {
        res.status(500).json({ error: 'Search failed' });
    }
});

// [UPDATED] CHECKOUT ROUTE: Removed invalid .populate() to fix crash
router.post('/physical/checkout', setTenantContext, async (req, res) => {
  try {
    if (req.role !== 'college_admin') return res.status(403).json({ error: 'Unauthorized' });
    
    // Accept 'userId' directly from Frontend Step 1
    const { copyId, userId } = req.body; 

    // 1. Find User
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // 2. Find Book
    const book = await PhysicalBook.findOne({ tenantId: req.tenant.id, "copies.copyId": copyId });
    if (!book) return res.status(404).json({ error: 'Book copy not found' });

    const copyIndex = book.copies.findIndex(c => c.copyId === copyId);
    const copy = book.copies[copyIndex];

    // 3. Status Checks
    if (copy.status === 'Issued') {
        const holderName = copy.issuedTo ? copy.issuedTo.name : 'Unknown';
        return res.status(400).json({ 
            error: `Book is currently issued to ${holderName}. Return the book first to reissue.` 
        });
    }

    if (copy.status !== 'Available') {
        return res.status(400).json({ error: `Book status is '${copy.status}', cannot issue.` });
    }

    // 4. Issue Book (Embed Data Directly)
    book.copies[copyIndex].status = 'Issued';
    book.copies[copyIndex].issuedTo = { 
        userId: user._id, 
        name: user.name, 
        email: user.email, 
        noteloomId: user.noteloomId || 'N/A' 
    };
    book.copies[copyIndex].issuedDate = new Date();
    
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 14);
    book.copies[copyIndex].dueDate = dueDate;

    await book.save();

    // 5. Fetch Role for response message
    const membership = await Membership.findOne({ userId: user._id, tenantId: req.tenant.id });
    const borrowerRole = membership ? membership.role : 'Member';

    // [FIX] Removed .populate() call. 
    // The data is embedded, so we just fetch the updated document.
    const updatedBook = await PhysicalBook.findById(book._id);
    
    res.json({ 
        book: updatedBook, 
        message: `Book issued to ${borrowerRole}: ${user.name}` 
    });

  } catch (err) { 
    console.error("Checkout Error:", err);
    res.status(500).json({ error: 'Checkout failed', details: err.message }); 
  }
});

// [FIXED] RETURN ROUTE: Uses Atomic Update to prevent crashes
router.post('/physical/return', setTenantContext, async (req, res) => {
  try {
    if (req.role !== 'college_admin') return res.status(403).json({ error: 'Unauthorized' });
    
    const { copyId } = req.body;

    if (!copyId) return res.status(400).json({ error: "Copy ID is required" });

    // Use atomic operation ($set) to update the specific item in the array directly
    // This avoids "Validation Error" when setting objects to null via .save()
    const updatedBook = await PhysicalBook.findOneAndUpdate(
      { 
        tenantId: req.tenant.id, 
        "copies.copyId": copyId 
      },
      {
        $set: {
          "copies.$.status": "Available",
          "copies.$.issuedTo": null,      // Safely clears the object
          "copies.$.issuedDate": null,
          "copies.$.dueDate": null
        }
      },
      { new: true } // Return the updated document
    );

    if (!updatedBook) {
        return res.status(404).json({ error: 'Book copy not found' });
    }

    res.json({ message: "Book returned successfully", book: updatedBook });

  } catch (err) { 
    console.error("Return Error:", err);
    res.status(500).json({ error: 'Return failed', details: err.message }); 
  }
});

router.delete('/physical/copy/:copyId', setTenantContext, async (req, res) => {
  try {
    if (req.role !== 'college_admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    const book = await PhysicalBook.findOne({
      tenantId: req.tenant.id,
      "copies.copyId": req.params.copyId
    });
    if (!book) {
      return res.status(404).json({ error: 'Book copy not found' });
    }
    const copy = book.copies.find(c => c.copyId === req.params.copyId);
    if (copy.status === 'Issued') {
      return res.status(400).json({ error: 'Cannot delete issued copy' });
    }
    copy.status = 'Removed';
    await book.save();
    res.json({ message: 'Copy removed successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to remove copy' });
  }
});

// [UPDATED] PUT: Edit Resource Details OR Schedule Deletion (Admin or Owner)
router.put('/digital/resource/:id', setTenantContext, async (req, res) => {
    try {
        const resource = await DigitalResource.findOne({ _id: req.params.id, tenantId: req.tenant.id });
        if (!resource) return res.status(404).json({ error: "Resource not found" });

        // [FIXED] Permission Check: Robust ID Comparison
        // Ensure we compare strings to strings
        const ownerId = resource.addedBy ? resource.addedBy.toString() : null;
        const currentUserId = req.user.id.toString();
        
        const isOwner = ownerId === currentUserId;
        const isAdmin = req.role === 'college_admin';

        if (!isAdmin && !isOwner) {
            return res.status(403).json({ error: "Unauthorized: You can only edit your own uploads." });
        }

        // [FIXED] Update Allowed Fields (Include deleteAfter)
        const { title, author, department, course, type, url, description, semester, deleteAfter } = req.body;
        
        // Use standard updates
        if (title) resource.title = title;
        if (author) resource.author = author;
        if (department) resource.department = department;
        if (course) resource.course = course;
        if (type) resource.type = type;
        if (url) resource.url = url;
        if (description) resource.description = description;
        if (semester) resource.semester = semester;

        // [NEW] Handle Deletion Scheduling
        // We explicitly check if deleteAfter is in the body (even if null)
        if (req.body.hasOwnProperty('deleteAfter')) {
            resource.deleteAfter = deleteAfter;
        }
        
        await resource.save();
        res.json(resource);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Update failed" });
    }
});

// [NEW] DELETE: Remove Resource (Admin or Owner)
router.delete('/digital/resource/:id', setTenantContext, async (req, res) => {
    try {
        const resource = await DigitalResource.findOne({ _id: req.params.id, tenantId: req.tenant.id });
        if (!resource) return res.status(404).json({ error: "Resource not found" });

        // Permission Check: Admin OR Owner
        const isOwner = resource.addedBy && resource.addedBy.toString() === req.user.id;
        if (req.role !== 'college_admin' && !isOwner) {
            return res.status(403).json({ error: "Unauthorized: You can only delete your own uploads." });
        }

        await DigitalResource.deleteOne({ _id: req.params.id });
        res.json({ message: "Resource deleted successfully" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Delete failed" });
    }
});



module.exports = router;