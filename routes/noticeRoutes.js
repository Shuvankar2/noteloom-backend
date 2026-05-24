const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Notice = require('../models/Notice');
const { setTenantContext } = require('../middleware/authMiddleware');

// --- CLOUDINARY UPLOAD CONFIG ---
const { uploadCloud } = require('../config/cloudinary');

router.use(setTenantContext);

router.get('/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const { department } = req.query;
    let query = { tenantId: req.tenant.id, type };
    if (type === 'departmental' && department) query.department = department;
    const notices = await Notice.find(query).sort({ createdAt: -1 });
    res.json(notices);
  } catch (error) { res.status(500).json({ error: 'Failed' }); }
});

// 🟢 Use uploadCloud instead
router.post('/', uploadCloud.array('files', 10), async (req, res) => {
  try {
    const { type, title, content, department, videoConfig } = req.body;
    if (type !== 'general' && req.role === 'student') {
      return res.status(403).json({ error: 'Students can only post general notices' });
    }

    let attachments = [];
    if (req.files) {
      attachments = req.files.map(file => ({
        originalName: file.originalname,
        fileName: file.filename,
        // 🟢 NEW: Save the secure Cloudinary URL directly
        fileUrl: file.path, 
        fileType: file.mimetype.startsWith('image/') ? 'image' : (file.mimetype.startsWith('video/') ? 'video' : 'document'),
        mimeType: file.mimetype,
        videoConfig: { playerType: videoConfig || 'mini' }
      }));
    }

    const newNotice = new Notice({
      tenantId: req.tenant.id, posterId: req.user.id, posterName: req.user.name, posterRole: req.role,
      type, title, content, department, attachments
    });
    await newNotice.save();
    res.json(newNotice);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.patch('/:id/react', async (req, res) => {
  const notice = await Notice.findById(req.params.id);
  const exists = notice.reactions.findIndex(r => r.userId.toString() === req.user.id.toString());
  if (exists > -1) notice.reactions.splice(exists, 1);
  else notice.reactions.push({ userId: req.user.id, userName: req.user.name });
  await notice.save();
  res.json(notice);
});

router.post('/:id/comments', async (req, res) => {
  const notice = await Notice.findById(req.params.id);
  notice.comments.push({ userId: req.user.id, userName: req.user.name, text: req.body.text, parentId: req.body.parentId });
  await notice.save();
  res.json(notice);
});

router.delete('/:id', async (req, res) => {
  try {
    const notice = await Notice.findById(req.params.id);
    if (!notice) return res.status(404).json({ error: 'Notice not found' });
    
    // Admins/IT can delete anything; otherwise, you must be the poster.
    if (!['admin', 'it'].includes(req.role) && notice.posterId.toString() !== req.user.id.toString()) {
        return res.status(403).json({ error: 'Unauthorized to delete this notice' });
    }

    // 🟢 REMOVED local fs.unlinkSync logic. 
    // The files will remain on Cloudinary but the database record is deleted.
    
    await Notice.findByIdAndDelete(req.params.id);
    res.json({ message: 'Notice deleted successfully' });
  } catch (error) { 
    res.status(500).json({ error: error.message }); 
  }
});

module.exports = router;