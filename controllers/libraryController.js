const { LibraryCredential, DigitalResource, PhysicalBook } = require('../models/Library');
const User = require('../models/User'); 
const Membership = require('../models/Membership');
const StudentProfile = require('../models/StudentProfile');
const FacultyProfile = require('../models/FacultyProfile');
const AdminProfile = require('../models/AdminProfile');
const { deleteFromCloudinary } = require('../utils/cloudinaryHelper');

// ==========================================
// 1. DIGITAL LIBRARY ACTIONS
// ==========================================

// GET: Fetch Resources (With Permission Logic)
exports.getDigitalLibrary = async (req, res) => {
  try {
    const tenantId = req.tenant.id; 
    const credentials = await LibraryCredential.find({ tenantId });
    
    let query = { tenantId };

    // Visibility Logic
    if (req.role !== 'college_admin') {
        query.$or = [
            { status: 'Approved' },
            { addedBy: req.user.id }
        ];
    }

    const resources = await DigitalResource.find(query)
        .populate('addedBy', 'name role') 
        .sort({ createdAt: -1 });
    
    res.json({ credentials, resources });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error fetching digital library data' });
  }
};

// POST: Add Resource (Handle Pending Logic)
exports.addDigitalResource = async (req, res) => {
  try {
    const { title, author, department, course, type, url, description, semester } = req.body;
    
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
      status: initialStatus,
      addedBy: req.user.id
    });

    await newResource.save();
    res.status(201).json(newResource);
  } catch (err) {
    console.error("Resource Upload Error:", err);
    res.status(500).json({ error: err.message || 'Failed to add resource' });
  }
};

// PUT: Approve/Reject Resource (Admin Only)
exports.approveRejectResource = async (req, res) => {
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
};

// PUT: Update/Add Institutional Credentials (Admin Only)
exports.saveLibraryCredential = async (req, res) => {
  try {
    if (req.role !== 'college_admin') {
      return res.status(403).json({ error: 'Access denied. Admins only.' });
    }
    
    const { _id, providerName, loginId, password, note, link } = req.body;
    
    let credential;
    if (_id) {
      credential = await LibraryCredential.findOneAndUpdate(
        { _id, tenantId: req.tenant.id },
        { providerName, loginId, password, note, link },
        { new: true }
      );
    } else {
      credential = new LibraryCredential({ 
        tenantId: req.tenant.id, 
        providerName, 
        loginId, 
        password, 
        note, 
        link
      });
      await credential.save();
    }
    res.json(credential);
  } catch (err) { 
    console.error(err);
    res.status(500).json({ error: 'Failed to save credential' }); 
  }
};

// DELETE: Delete Credential
exports.deleteLibraryCredential = async (req, res) => {
    try {
      if (req.role !== 'college_admin') return res.status(403).json({ error: 'Unauthorized' });
      await LibraryCredential.findOneAndDelete({ _id: req.params.id, tenantId: req.tenant.id });
      res.json({ message: 'Deleted' });
    } catch (err) { res.status(500).json({ error: 'Delete failed' }); }
};

// PUT: Edit Resource Details OR Schedule Deletion
exports.updateDigitalResource = async (req, res) => {
    try {
        const resource = await DigitalResource.findOne({ _id: req.params.id, tenantId: req.tenant.id });
        if (!resource) return res.status(404).json({ error: "Resource not found" });

        const ownerId = resource.addedBy ? resource.addedBy.toString() : null;
        const currentUserId = req.user.id.toString();
        
        const isOwner = ownerId === currentUserId;
        const isAdmin = req.role === 'college_admin';

        if (!isAdmin && !isOwner) {
            return res.status(403).json({ error: "Unauthorized: You can only edit your own uploads." });
        }

        const { title, author, department, course, type, url, description, semester, deleteAfter } = req.body;
        
        if (title) resource.title = title;
        if (author) resource.author = author;
        if (department) resource.department = department;
        if (course) resource.course = course;
        if (type) resource.type = type;
        if (url) resource.url = url;
        if (description) resource.description = description;
        if (semester) resource.semester = semester;

        if (req.body.hasOwnProperty('deleteAfter')) {
            resource.deleteAfter = deleteAfter;
        }
        
        await resource.save();
        res.json(resource);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Update failed" });
    }
};

// DELETE: Remove Resource
exports.deleteDigitalResource = async (req, res) => {
    try {
        const resource = await DigitalResource.findOne({ _id: req.params.id, tenantId: req.tenant.id });
        if (!resource) return res.status(404).json({ error: "Resource not found" });

        const isOwner = resource.addedBy && resource.addedBy.toString() === req.user.id;
        if (req.role !== 'college_admin' && !isOwner) {
            return res.status(403).json({ error: "Unauthorized: You can only delete your own uploads." });
        }

        // Delete from Cloudinary
        if (resource.url) {
            await deleteFromCloudinary(resource.url);
        }

        await DigitalResource.deleteOne({ _id: req.params.id });
        res.json({ message: "Resource deleted successfully" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Delete failed: " + err.message });
    }
};

// ==========================================
// 2. PHYSICAL LIBRARY ACTIONS
// ==========================================

// GET: Fetch Physical Books
exports.getPhysicalBooks = async (req, res) => {
  try {
    const books = await PhysicalBook
      .find({ tenantId: req.tenant.id })
      .sort({ title: 1 });

    res.json(books);
  } catch (err) {
    console.error("Physical fetch error:", err);
    res.status(500).json({ error: 'Failed to fetch inventory' });
  }
};

// GET: Fetch User Details for Circulation
exports.getCirculationUser = async (req, res) => {
    try {
        if (req.role !== 'college_admin') return res.status(403).json({ error: 'Unauthorized' });

        const { identifier } = req.params;

        let user = await User.findOne({ 
            $or: [ { email: identifier }, { noteloomId: identifier } ] 
        });

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

        const membership = await Membership.findOne({ userId: user._id, tenantId: req.tenant.id });
        if (!membership) return res.status(403).json({ error: 'User is not a member' });

        let profileUid = null;
        let profilePic = null;

        if (membership.role === 'student') {
            const p = await StudentProfile.findOne({ userId: user._id, tenantId: req.tenant.id });
            if (p) {
                profileUid = p.uid || p.rollNo;
                profilePic = p.profilePicture;
            }
        } else if (membership.role === 'faculty') {
            const p = await FacultyProfile.findOne({ userId: user._id, tenantId: req.tenant.id });
            if (p) {
                profileUid = p.uid || p.employeeId;
                profilePic = p.profilePicture; 
            }
        } else if (membership.role === 'college_admin') {
            const p = await AdminProfile.findOne({ userId: user._id, tenantId: req.tenant.id });
            if (p) {
                profileUid = p.uid || p.employeeId;
                profilePic = p.profilePicture;
            }
        }

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
                profilePicture: profilePic
            },
            holdings
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Lookup failed' });
    }
};

// GET: Fetch Copy Details
exports.getPhysicalBookCopy = async (req, res) => {
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
            issuedTo: copy.issuedTo
        });
    } catch (err) {
        res.status(500).json({ error: 'Search failed' });
    }
};

// POST: Book Checkout
exports.checkoutBook = async (req, res) => {
  try {
    if (req.role !== 'college_admin') return res.status(403).json({ error: 'Unauthorized' });
    
    const { copyId, userId } = req.body; 

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const book = await PhysicalBook.findOne({ tenantId: req.tenant.id, "copies.copyId": copyId });
    if (!book) return res.status(404).json({ error: 'Book copy not found' });

    const copyIndex = book.copies.findIndex(c => c.copyId === copyId);
    const copy = book.copies[copyIndex];

    if (copy.status === 'Issued') {
        const holderName = copy.issuedTo ? copy.issuedTo.name : 'Unknown';
        return res.status(400).json({ 
            error: `Book is currently issued to ${holderName}. Return the book first to reissue.` 
        });
    }

    if (copy.status !== 'Available') {
        return res.status(400).json({ error: `Book status is '${copy.status}', cannot issue.` });
    }

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

    const membership = await Membership.findOne({ userId: user._id, tenantId: req.tenant.id });
    const borrowerRole = membership ? membership.role : 'Member';

    const updatedBook = await PhysicalBook.findById(book._id);
    
    res.json({ 
        book: updatedBook, 
        message: `Book issued to ${borrowerRole}: ${user.name}` 
    });

  } catch (err) { 
    console.error("Checkout Error:", err);
    res.status(500).json({ error: 'Checkout failed', details: err.message }); 
  }
};

// POST: Book Return
exports.returnBook = async (req, res) => {
  try {
    if (req.role !== 'college_admin') return res.status(403).json({ error: 'Unauthorized' });
    
    const { copyId } = req.body;

    if (!copyId) return res.status(400).json({ error: "Copy ID is required" });

    const updatedBook = await PhysicalBook.findOneAndUpdate(
      { 
        tenantId: req.tenant.id, 
        "copies.copyId": copyId 
      },
      {
        $set: {
          "copies.$.status": "Available",
          "copies.$.issuedTo": null,
          "copies.$.issuedDate": null,
          "copies.$.dueDate": null
        }
      },
      { new: true }
    );

    if (!updatedBook) {
        return res.status(404).json({ error: 'Book copy not found' });
    }

    res.json({ message: "Book returned successfully", book: updatedBook });

  } catch (err) { 
    console.error("Return Error:", err);
    res.status(500).json({ error: 'Return failed', details: err.message }); 
  }
};

// DELETE: Remove Book Copy
exports.deleteBookCopy = async (req, res) => {
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
};
