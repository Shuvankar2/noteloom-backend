const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Notice = require('../models/Notice');
const { setTenantContext } = require('../middleware/authMiddleware');

const webdataDir = path.join(__dirname, '../../webdata');
const dynamicStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    let folder = req.body.type === 'staff' ? 'staff-notices' : (req.body.type === 'departmental' ? 'departmental-notices' : 'general');
    const uploadPath = path.join(webdataDir, 'uploads', folder);
    if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    cb(null, 'file-' + Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname));
  }
});
const uploadNotice = multer({ storage: dynamicStorage, limits: { fileSize: 20 * 1024 * 1024 } });

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

router.post('/', uploadNotice.array('media', 10), async (req, res) => {
  try {
    const { title, content, type, department, videoConfig } = req.body;
    if (type === 'staff' && req.role !== 'college_admin') return res.status(403).json({ error: 'Unauthorized' });
    if (type === 'departmental' && req.role === 'student') return res.status(403).json({ error: 'Students cannot post' });

    let attachments = [];
    if (req.files) {
      attachments = req.files.map(file => ({
        fileUrl: path.relative(path.join(__dirname, '../../'), file.path).replace(/\\/g, '/'),
        fileName: file.filename,
        originalName: file.originalname,
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
    const notice = await Notice.findById(req.params.id);
    if (notice.posterId.toString() !== req.user.id.toString()) return res.status(403).json({ error: 'Unauthorized' });
    await Notice.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
});

module.exports = router;