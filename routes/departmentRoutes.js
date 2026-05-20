const express = require('express');
const router = express.Router();
const Department = require('../models/Department');
const Subject = require('../models/Subject');
const { setTenantContext } = require('../middleware/authMiddleware');

router.use(setTenantContext); // Apply middleware to all routes

// --- DEPARTMENTS ---
router.get('/', async (req, res) => {
  try {
    const departments = await Department.find({ tenantId: req.tenant.id });
    res.json(departments);
  } catch (error) { res.status(500).json({ error: 'Failed to fetch departments' }); }
});

router.post('/', async (req, res) => {
  try {
    const { name, code } = req.body;
    const newDept = new Department({ tenantId: req.tenant.id, name, code, streams: [] });
    await newDept.save();
    res.json(newDept);
  } catch (error) { res.status(500).json({ error: 'Failed to create department' }); }
});

router.put('/:id', async (req, res) => {
  try {
    const { name, code, headOfDepartment } = req.body;
    const dept = await Department.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenant.id },
      { name, code, headOfDepartment },
      { new: true }
    );
    res.json(dept);
  } catch (error) { res.status(500).json({ error: 'Failed to update settings' }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await Department.findOneAndDelete({ _id: req.params.id, tenantId: req.tenant.id });
    res.json({ message: 'Department deleted' });
  } catch (error) { res.status(500).json({ error: 'Failed to delete department' }); }
});

// --- STREAMS ---
router.post('/:id/streams', async (req, res) => {
  try {
    const { name, code } = req.body;
    if (!name || !code) return res.status(400).json({ error: 'Stream name and code are required' });
    if (!/^\d{3}$/.test(code)) return res.status(400).json({ error: 'Stream code must be 3 digits' });

    const existingStream = await Department.findOne({ tenantId: req.tenant.id, 'streams.code': code });
    if (existingStream) return res.status(400).json({ error: `Stream code '${code}' is already used.` });

    const dept = await Department.findOne({ _id: req.params.id, tenantId: req.tenant.id });
    if (!dept) return res.status(404).json({ error: 'Department not found' });

    dept.streams.push({ name, code });
    await dept.save();
    res.json(dept);
  } catch (error) { res.status(500).json({ error: 'Failed to add stream' }); }
});

router.put('/:deptId/streams/:streamId/config', async (req, res) => {
  try {
    const { deptId, streamId } = req.params;
    const { isLocked, curriculumType, totalTerms, termStructure, trimesterStructure } = req.body;

    const dept = await Department.findOne({ _id: deptId, tenantId: req.tenant.id });
    if (!dept) return res.status(404).json({ error: 'Department not found' });

    const stream = dept.streams.id(streamId);
    if (!stream) return res.status(404).json({ error: 'Stream not found' });

    if (isLocked !== undefined) stream.isLocked = isLocked;
    
    if (!stream.isLocked || isLocked === false) {
      if (curriculumType) stream.curriculumType = curriculumType;
      if (totalTerms) stream.totalTerms = totalTerms;
      if (termStructure) stream.termStructure = termStructure;
      if (trimesterStructure) stream.trimesterStructure = trimesterStructure;
      if (curriculumType && totalTerms) stream.isConfigured = true;
    }

    await dept.save();
    res.json(dept);
  } catch (error) { res.status(500).json({ error: 'Failed to update configuration' }); }
});

router.delete('/:id/streams/:streamId', async (req, res) => {
  try {
    const dept = await Department.findOne({ _id: req.params.id, tenantId: req.tenant.id });
    if (!dept) return res.status(404).json({ error: 'Department not found' });
    dept.streams = dept.streams.filter(s => s._id.toString() !== req.params.streamId);
    await dept.save();
    res.json(dept);
  } catch (error) { res.status(500).json({ error: 'Failed to delete stream' }); }
});

// --- SUBJECTS ---
router.get('/:deptId/subjects', async (req, res) => {
  try {
    const subjects = await Subject.find({ departmentId: req.params.deptId, tenantId: req.tenant.id }).sort({ code: 1 });
    res.json(subjects);
  } catch (error) { res.status(500).json({ error: 'Failed to fetch subjects' }); }
});

router.post('/:deptId/subjects', async (req, res) => {
  try {
    const { name, code, type, credits, semester } = req.body;
    const newSubject = new Subject({
      tenantId: req.tenant.id,
      departmentId: req.params.deptId,
      name,
      code: code.toUpperCase(),
      type, credits, semester,
      year: new Date().getFullYear()
    });
    await newSubject.save();
    res.json(newSubject);
  } catch (error) { 
      if (error.code === 11000) return res.status(400).json({ error: `Subject Code '${req.body.code}' already exists.` });
      res.status(500).json({ error: 'Failed to create subject' }); 
  }
});

router.put('/subjects/:id', async (req, res) => {
    try {
        const { isActive } = req.body;
        const subject = await Subject.findOneAndUpdate({ _id: req.params.id, tenantId: req.tenant.id }, { isActive }, { new: true });
        res.json(subject);
    } catch (error) { res.status(500).json({ error: 'Failed to update subject' }); }
});

router.delete('/subjects/:id', async (req, res) => {
    try {
        await Subject.findOneAndDelete({ _id: req.params.id, tenantId: req.tenant.id });
        res.json({ message: 'Subject deleted' });
    } catch (error) { res.status(500).json({ error: 'Failed to delete subject' }); }
});

// GET /departments/:id/overview
router.get('/:id/overview', async (req, res) => {
  const dept = await Department.findOne({
    _id: req.params.id,
    tenantId: req.tenant.id
  });

  const subjects = await Subject.find({
    departmentId: dept._id,
    tenantId: req.tenant.id,
    isActive: true
  });

  res.json({ dept, subjects });
});


module.exports = router;