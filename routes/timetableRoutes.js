const express = require('express');
const router = express.Router();
const { CalendarEvent, ClassRoutine, LessonLog, ClassSchedule } = require('../models/TimetableModels');
const { setTenantContext } = require('../middleware/authMiddleware');

router.use(setTenantContext);

// --- CALENDAR ---
router.get('/calendar/events', async (req, res) => {
  try { const events = await CalendarEvent.find({ userId: req.user.id }).sort({ date: 1 }); res.json(events); }
  catch(e) { res.status(500).json({ error: e.message }); }
});
router.post('/calendar/events', async (req, res) => {
  try { const event = new CalendarEvent({ ...req.body, userId: req.user.id }); await event.save(); res.json(event); }
  catch(e) { res.status(500).json({ error: e.message }); }
});
router.delete('/calendar/events/:id', async (req, res) => {
  try { await CalendarEvent.findOneAndDelete({ _id: req.params.id, userId: req.user.id }); res.json({ success: true }); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

// --- ROUTINES ---
router.get('/routine/batch/:batchId', async (req, res) => {
  try { const routines = await ClassRoutine.find({ batchId: req.params.batchId }); res.json(routines); }
  catch(e) { res.status(500).json({ error: e.message }); }
});
router.post('/routine/batch/:batchId', async (req, res) => {
  if (req.role === 'student') return res.status(403).json({ error: "Unauthorized" });
  try {
    const routine = await ClassRoutine.findOneAndUpdate(
      { batchId: req.params.batchId, dayOfWeek: req.body.dayOfWeek },
      { periods: req.body.periods, tenantId: req.tenant.id },
      { new: true, upsert: true }
    );
    res.json(routine);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// --- LESSON LOGS ---
router.get('/lessons', async (req, res) => {
  try {
    const { startDate, endDate, batchId } = req.query;
    let query = { tenantId: req.tenant.id };
    if (batchId) query.batchId = batchId;
    if (startDate && endDate) query.date = { $gte: startDate, $lte: endDate };
    
    const logs = await LessonLog.find(query).populate('batchId', 'batchName section').populate('facultyId', 'name').sort({ date: 1 });
    res.json(logs);
  } catch(e) { res.status(500).json({ error: e.message }); }
});
router.post('/lessons', async (req, res) => {
  if (req.role !== 'faculty') return res.status(403).json({ error: "Only faculty" });
  try {
    const log = new LessonLog({ ...req.body, facultyId: req.user.id, tenantId: req.tenant.id });
    await log.save();
    res.json(log);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// --- FACULTY SCHEDULE ---
router.get('/faculty/schedule', async (req, res) => {
    try {
      const schedules = await ClassSchedule.find({ facultyId: req.user.id, tenantId: req.tenant.id })
      .populate('batchId').populate('subjectId').sort({ dayOfWeek: 1, startTime: 1 });
      res.json(schedules);
    } catch (err) { res.status(500).json({ error: err.message }); }
});
router.post('/faculty/schedule', async (req, res) => {
    try {
      const item = new ClassSchedule({ tenantId: req.tenant.id, facultyId: req.user.id, ...req.body });
      await item.save();
      res.json(item);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;