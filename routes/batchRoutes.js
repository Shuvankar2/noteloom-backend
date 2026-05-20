const express = require('express');
const router = express.Router();
const Batch = require('../models/Batch');
const StudentProfile = require('../models/StudentProfile');
const { setTenantContext } = require('../middleware/authMiddleware');

router.use(setTenantContext);

router.post('/', async (req, res) => {
  try {
    const { departmentId, streamCode, admissionYear, admissionMonth, batchName, sections } = req.body;
    if (!admissionMonth) return res.status(400).json({ error: "Admission month required" });
    const createdBatches = [];
    for (const sec of sections) {
      const batch = new Batch({
        tenantId: req.tenant.id, departmentId, streamCode, admissionYear, admissionMonth, batchName, section: sec
      });
      await batch.save();
      createdBatches.push(batch);
    }
    res.json(createdBatches);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/', async (req, res) => {
  try {
    const batches = await Batch.find({ tenantId: req.tenant.id }).populate('departmentId');
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const currentDate = new Date();

    const updatedBatches = batches.map(batch => {
      const batchObj = batch.toObject();
      let currentTerm = 1;
      let isAlumni = false;
      const dept = batch.departmentId;
      const streamConfig = dept?.streams?.find(s => s.code === batch.streamCode);

      if (streamConfig && streamConfig.isConfigured) {
        const admitDate = new Date(batch.admissionYear, months.indexOf(batch.admissionMonth), 1);
        if (currentDate >= admitDate) {
          let termsPassed = 1;
          let checkDate = new Date(admitDate);
          checkDate.setMonth(checkDate.getMonth() + 1);
          while (checkDate <= currentDate) {
            const mName = months[checkDate.getMonth()];
            if (streamConfig.curriculumType === 'Semester') {
              if (mName === streamConfig.termStructure.oddStartMonth || mName === streamConfig.termStructure.evenStartMonth) termsPassed++;
            } else {
              if ([streamConfig.trimesterStructure.term1Start, streamConfig.trimesterStructure.term2Start, streamConfig.trimesterStructure.term3Start].includes(mName)) termsPassed++;
            }
            checkDate.setMonth(checkDate.getMonth() + 1);
          }
          currentTerm = termsPassed;
        }
        if (currentTerm > streamConfig.totalTerms) { currentTerm = streamConfig.totalTerms; isAlumni = true; }
      }
      return { ...batchObj, currentTerm, isAlumni };
    });
    res.json(updatedBatches);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/:batchId/enroll', async (req, res) => {
  try {
    const { noteloomId } = req.body;
    const profile = await StudentProfile.findOne({ uid: String(noteloomId).trim(), tenantId: req.tenant.id }).populate('userId');
    if (!profile) return res.status(404).json({ error: "Student not found" });
    if (profile.batchId && profile.batchId.toString() === req.params.batchId) return res.status(400).json({ error: "Already enrolled" });

    profile.batchId = req.params.batchId;
    await profile.save();
    await Batch.findByIdAndUpdate(req.params.batchId, { $addToSet: { students: profile.userId._id } });
    
    res.json({ success: true, student: { name: profile.userId.name, username: profile.uid, _id: profile.userId._id } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /batches/my-batches
// Fetches batches where the logged-in user is assigned as faculty
router.get('/my-batches', async (req, res) => {
  try {
    const userId = req.user.id; // From authMiddleware

    const batches = await Batch.find({ 
      tenantId: req.tenant.id,
      faculty: userId  // Matches the faculty array update in the model
    })
    .populate('departmentId', 'name code') // Get Dept name
    .select('batchName section streamCode departmentId currentTerm students');

    // Add a quick student count for the UI
    const formattedBatches = batches.map(b => ({
      _id: b._id,
      name: b.batchName,
      section: b.section,
      deptName: b.departmentId?.name || 'General',
      studentCount: b.students.length,
      currentTerm: b.currentTerm
    }));

    res.json(formattedBatches);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:batchId/students', async (req, res) => {
    try {
        const profiles = await StudentProfile.find({ batchId: req.params.batchId, tenantId: req.tenant.id }).populate('userId', 'name email');
        const students = profiles.map(p => p.userId ? ({ _id: p.userId._id, name: p.userId.name, email: p.userId.email, username: p.uid, rollNo: p.rollNo }) : null).filter(s => s);
        res.json(students);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
    try { await Batch.findByIdAndDelete(req.params.id); res.json({ message: 'Deleted' }); } 
    catch(e) { res.status(500).json({ error: 'Failed to delete' }); }
});

module.exports = router;