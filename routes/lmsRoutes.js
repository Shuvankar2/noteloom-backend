const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// --- IMPORTS ---
const ClassModule = require('../models/ClassModule');
const ClassContent = require('../models/ClassContent');
const ContentProgress = require('../models/ContentProgress');
const Subject = require('../models/Subject'); // <--- ADD THIS IMPORT
const { setTenantContext } = require('../middleware/authMiddleware');

// --- CLOUDINARY UPLOAD CONFIG ---
const { uploadCloud } = require('../config/cloudinary');

router.use(setTenantContext);

// --- NEW ROUTE: ALL SUBJECTS ---
// Matches GET /api/all-subjects
router.get('/all-subjects', async (req, res) => {
  try {
    // 1. Find all subjects for this tenant
    // 2. .populate('departmentId') fetches the actual Department document
    // 3. We select 'name' and 'streams' from the Department model
    const subjects = await Subject.find({ tenantId: req.tenant.id })
      .populate('departmentId', 'name streams') 
      .select('name code semester credits departmentId'); // Select specific subject fields

    // 4. Map the data to a cleaner format for the frontend
    const formattedSubjects = subjects.map(sub => ({
      _id: sub._id,
      name: sub.name,          // Subject Name
      code: sub.code,          // Subject Code
      semester: sub.semester,
      departmentName: sub.departmentId?.name || 'General', // Department/Stream Name
      availableStreams: sub.departmentId?.streams || []    // List of streams in that dept
    }));

    res.json(formattedSubjects);
  } catch (error) { 
    console.error("Error fetching subjects:", error);
    res.status(500).json({ error: 'Failed to fetch subjects' }); 
  }
});

// --- MODULES ---
router.get('/classrooms/:id/modules', async (req, res) => {
  try {
    const modules = await ClassModule.find({ classroomId: req.params.id }).sort({ order: 1 });
    res.json(modules);
  } catch (e) { res.status(500).json({ error: 'Failed to fetch modules' }); }
});

router.post('/classrooms/:id/modules', async (req, res) => {
  try {
    if (req.role === 'student') return res.status(403).json({ error: 'Unauthorized' });
    const count = await ClassModule.countDocuments({ classroomId: req.params.id });
    const newModule = new ClassModule({ classroomId: req.params.id, title: req.body.title, order: count + 1 });
    await newModule.save();
    res.json(newModule);
  } catch (e) { res.status(500).json({ error: 'Failed to create module' }); }
});

// --- CONTENT & PROGRESS ---
router.get('/modules/:moduleId/content', async (req, res) => {
  try {
    const contentList = await ClassContent.find({ moduleId: req.params.moduleId }).sort({ createdAt: -1 }).lean();
    if (req.role === 'student') {
      const contentIds = contentList.map(c => c._id);
      const progressRecords = await ContentProgress.find({ userId: req.user.id, contentId: { $in: contentIds } });
      const progressMap = {};
      progressRecords.forEach(p => { progressMap[p.contentId.toString()] = p.isCompleted; });
      contentList.forEach(item => { item.isCompleted = !!progressMap[item._id.toString()]; });
    }
    res.json(contentList);
  } catch (e) { res.status(500).json({ error: 'Failed to fetch content' }); }
});

// Upload Content
// Upload Content (Updated for Cloudinary)
router.post('/modules/:moduleId/content', uploadCloud.array('files'), async (req, res) => {
  try {
    if (req.role === 'student') return res.status(403).json({ error: 'Unauthorized' });
    const { title, description, type, videoUrl, allowDownload } = req.body;
    
    const attachments = req.files ? req.files.map(file => ({
      originalName: file.originalname,
      fileName: file.filename, // Cloudinary uses this for the public_id
      fileUrl: file.path,      // 🟢 THIS IS NOW THE SECURE CLOUDINARY URL! No path logic needed.
      fileType: file.mimetype.split('/')[0],
      size: file.size
    })) : [];

    const newContent = new ClassContent({
      moduleId: req.params.moduleId,
      type, title, description, videoUrl,
      allowDownload: allowDownload === 'true',
      attachments,
      fileName: attachments.length > 0 ? attachments[0].fileName : '',
      fileUrl: attachments.length > 0 ? attachments[0].fileUrl : ''
    });
    
    await newContent.save();
    res.json(newContent);
  } catch (e) { res.status(500).json({ error: 'Upload failed: ' + e.message }); }
});

// Single Content Detail
router.get('/content/:id', async (req, res) => {
  try {
    const content = await ClassContent.findById(req.params.id);
    if (!content) return res.status(404).json({ error: "Content not found" });
    let isCompleted = false;
    if (req.role === 'student') {
      const progress = await ContentProgress.findOne({ userId: req.user.id, contentId: content._id });
      if (progress && progress.isCompleted) isCompleted = true;
    }
    res.json({ ...content.toObject(), isCompleted });
  } catch (e) { res.status(500).json({ error: "Server error" }); }
});

// Toggle Download
router.put('/content/:id/toggle-download', async (req, res) => {
    try {
        if (req.role !== 'faculty') return res.status(403).json({ error: 'Unauthorized' });
        const content = await ClassContent.findById(req.params.id);
        content.allowDownload = !content.allowDownload;
        await content.save();
        res.json({ allowDownload: content.allowDownload });
    } catch(e) { res.status(500).json({ error: 'Error updating' }); }
});

// Mark Complete
router.post('/content/:id/complete', async (req, res) => {
  try {
    if (req.role !== 'student') return res.json({ success: true, message: "Bypassed" });
    const isCompleted = req.body.isCompleted !== undefined ? req.body.isCompleted : true;
    const doc = await ContentProgress.findOneAndUpdate(
      { userId: req.user.id, contentId: req.params.id },
      { $set: { isCompleted, progress: isCompleted ? 100 : 0, lastWatched: new Date() } },
      { new: true, upsert: true }
    );
    res.json({ success: true, isCompleted: doc.isCompleted });
  } catch (e) { res.status(500).json({ error: "Server error" }); }
});

// Delete Content
// Delete Content (Updated for Vercel)
router.delete('/content/:id', async (req, res) => {
    try {
        if (req.role === 'student') return res.status(403).json({ error: 'Unauthorized' });
        
        const content = await ClassContent.findById(req.params.id);
        if (!content) return res.status(404).json({ error: 'Content not found' });
        
        // 🟢 REMOVED local fs.unlinkSync logic. 
        // It now simply deletes the database record.
        
        await ClassContent.findByIdAndDelete(req.params.id);
        res.json({ message: 'Deleted' });
    } catch(e) { res.status(500).json({ error: 'Delete failed' }); }
});

module.exports = router;