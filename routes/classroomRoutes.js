const express = require('express');
const router = express.Router();
const Classroom = require('../models/Classroom');
const StudentProfile = require('../models/StudentProfile');
const FacultyProfile = require('../models/FacultyProfile');
const Subject = require('../models/Subject');
const { setTenantContext } = require('../middleware/authMiddleware');

router.use(setTenantContext);

// Get Classrooms
router.get('/', async (req, res) => {
  try {
    let query = { tenantId: req.tenant.id };
    if (req.role === 'student') query.students = req.user.id;
    else query.$or = [{ creatorId: req.user.id }, { teachers: req.user.id }];

    const classes = await Classroom.find(query)
      .populate('creatorId', 'name')
      .populate('students', 'name email')
      .populate('teachers', 'name email') // 🟢 UPDATED: Populate teachers
      .populate('creatorId', 'name')
      .sort({ createdAt: -1 })
      .lean();

    const enhancedClasses = await Promise.all(classes.map(async (cls) => {
      // 🟢 OPTIONAL: You could also enhance teacher profiles here if needed, 
      // but basic name/email from populate above is usually enough.
      
      if (!cls.students || cls.students.length === 0) return cls;
      const studentUserIds = cls.students.map(s => s._id);
      const profiles = await StudentProfile.find({ userId: { $in: studentUserIds }, tenantId: req.tenant.id }).select('userId uid stream rollNo');
      
      const studentsWithDetails = cls.students.map(student => {
        const profile = profiles.find(p => p.userId.toString() === student._id.toString());
        return {
          ...student,
          uid: profile ? (profile.uid || profile.rollNo) : 'N/A',
          stream: profile ? (profile.stream || 'General') : 'N/A'
        };
      });
      return { ...cls, students: studentsWithDetails };
    }));
    
    res.json(enhancedClasses);
  } catch (error) { res.status(500).json({ error: 'Failed to fetch classes' }); }
});

// Create Classroom
router.post('/', async (req, res) => {
  try {
    const { subjectName, subjectCode, batchYear, stream, semester, addMode, rangeStart, rangeEnd } = req.body;

    const newClass = new Classroom({
      tenantId: req.tenant.id,
      name: subjectName,
      subjectCode,
      batchYear, stream, semester,
      creatorId: req.user.id,
      teachers: [req.user.id],
      students: []
    });

    if (addMode !== 'later') {
      let profiles = await StudentProfile.find({ tenantId: req.tenant.id, stream: stream, currentSemester: semester });
      if (addMode === 'roll_range') {
        profiles = profiles.filter(p => parseInt(p.rollNo) >= parseInt(rangeStart) && parseInt(p.rollNo) <= parseInt(rangeEnd));
      } else if (addMode === 'id_range') {
        profiles = profiles.filter(p => p.uid >= rangeStart && p.uid <= rangeEnd);
      }
      newClass.students = profiles.map(p => p.userId);
    }

    await newClass.save();
    res.json(newClass);
  } catch (error) { res.status(500).json({ error: 'Failed to create classroom' }); }
});

// Enroll User
router.post('/:id/enroll', async (req, res) => {
  try {
    const { uid } = req.body;
    let profile = await StudentProfile.findOne({ uid: uid, tenantId: req.tenant.id });
    let roleType = 'student';

    if (!profile) {
      profile = await FacultyProfile.findOne({ uid: uid, tenantId: req.tenant.id });
      roleType = 'faculty';
    }

    if (!profile) return res.status(404).json({ error: 'User not found' });
    const classroom = await Classroom.findOne({ _id: req.params.id, tenantId: req.tenant.id });

    if (roleType === 'student') {
        if (classroom.students.includes(profile.userId)) return res.status(400).json({ error: 'Student already enrolled' });
        classroom.students.push(profile.userId);
    } else {
        if (classroom.teachers.includes(profile.userId)) return res.status(400).json({ error: 'Faculty already added' });
        classroom.teachers.push(profile.userId);
    }
    await classroom.save();
    res.json({ message: 'User added successfully' });
  } catch (error) { res.status(500).json({ error: 'Failed to enroll user' }); }
});

// Unenroll
router.delete('/:id/unenroll', async (req, res) => {
  try {
    const classroom = await Classroom.findOne({ _id: req.params.id, tenantId: req.tenant.id });
    if (!classroom) return res.status(404).json({ error: 'Classroom not found' });

    if (req.role === 'student') {
      classroom.students = classroom.students.filter(id => id.toString() !== req.user.id.toString());
    } else if (req.role === 'faculty') {
      if (classroom.teachers.length <= 1) return res.status(400).json({ error: 'Cannot leave as last teacher' });
      classroom.teachers = classroom.teachers.filter(id => id.toString() !== req.user.id.toString());
    }

    await classroom.save();
    res.json({ message: 'Unenrolled successfully' });
  } catch (error) { res.status(500).json({ error: 'Failed to leave class' }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await Classroom.findOneAndDelete({ _id: req.params.id, creatorId: req.user.id });
    res.json({ message: 'Deleted' });
  } catch (error) { res.status(500).json({ error: 'Delete failed' }); }
});

module.exports = router;