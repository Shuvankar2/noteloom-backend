const mongoose = require('mongoose');

// Models
const Batch = require('../models/Batch');
const StudentProfile = require('../models/StudentProfile');
const FacultyProfile = require('../models/FacultyProfile');
const Classroom = require('../models/Classroom');
const Department = require('../models/Department');
const Subject = require('../models/Subject');

// ==========================================
// 1. BATCH CONTROLLER ACTIONS
// ==========================================

exports.createBatch = async (req, res) => {
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
};

exports.getBatches = async (req, res) => {
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
};

exports.enrollStudent = async (req, res) => {
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
};

exports.getMyBatches = async (req, res) => {
  try {
    const userId = req.user.id;
    const batches = await Batch.find({ 
      tenantId: req.tenant.id,
      faculty: userId
    })
    .populate('departmentId', 'name code')
    .select('batchName section streamCode departmentId currentTerm students');

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
};

exports.getBatchStudents = async (req, res) => {
    try {
        const profiles = await StudentProfile.find({ batchId: req.params.batchId, tenantId: req.tenant.id }).populate('userId', 'name email');
        const students = profiles.map(p => p.userId ? ({ _id: p.userId._id, name: p.userId.name, email: p.userId.email, username: p.uid, rollNo: p.rollNo }) : null).filter(s => s);
        res.json(students);
    } catch(e) { res.status(500).json({ error: e.message }); }
};

exports.deleteBatch = async (req, res) => {
    try { await Batch.findByIdAndDelete(req.params.id); res.json({ message: 'Deleted' }); } 
    catch(e) { res.status(500).json({ error: 'Failed to delete' }); }
};

// ==========================================
// 2. CLASSROOM CONTROLLER ACTIONS
// ==========================================

exports.getClassrooms = async (req, res) => {
  try {
    let query = { tenantId: req.tenant.id };
    if (req.role === 'student') query.students = req.user.id;
    else query.$or = [{ creatorId: req.user.id }, { teachers: req.user.id }];

    const classes = await Classroom.find(query)
      .populate('creatorId', 'name')
      .populate('students', 'name email')
      .populate('teachers', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    const enhancedClasses = await Promise.all(classes.map(async (cls) => {
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
};

exports.createClassroom = async (req, res) => {
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
};

exports.enrollUserInClass = async (req, res) => {
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
};

exports.unenrollFromClass = async (req, res) => {
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
};

exports.deleteClassroom = async (req, res) => {
  try {
    await Classroom.findOneAndDelete({ _id: req.params.id, creatorId: req.user.id });
    res.json({ message: 'Deleted' });
  } catch (error) { res.status(500).json({ error: 'Delete failed' }); }
};

// ==========================================
// 3. DEPARTMENT CONTROLLER ACTIONS
// ==========================================

exports.getDepartments = async (req, res) => {
  try {
    const departments = await Department.find({ tenantId: req.tenant.id });
    res.json(departments);
  } catch (error) { res.status(500).json({ error: 'Failed to fetch departments' }); }
};

exports.createDepartment = async (req, res) => {
  try {
    const { name, code } = req.body;
    const newDept = new Department({ tenantId: req.tenant.id, name, code, streams: [] });
    await newDept.save();
    res.json(newDept);
  } catch (error) { res.status(500).json({ error: 'Failed to create department' }); }
};

exports.updateDepartment = async (req, res) => {
  try {
    const { name, code, headOfDepartment } = req.body;
    const dept = await Department.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenant.id },
      { name, code, headOfDepartment },
      { new: true }
    );
    res.json(dept);
  } catch (error) { res.status(500).json({ error: 'Failed to update settings' }); }
};

exports.deleteDepartment = async (req, res) => {
  try {
    await Department.findOneAndDelete({ _id: req.params.id, tenantId: req.tenant.id });
    res.json({ message: 'Department deleted' });
  } catch (error) { res.status(500).json({ error: 'Failed to delete department' }); }
};

// ==========================================
// 4. STREAM CONTROLLER ACTIONS
// ==========================================

exports.createStream = async (req, res) => {
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
};

exports.configStream = async (req, res) => {
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
};

exports.deleteStream = async (req, res) => {
  try {
    const dept = await Department.findOne({ _id: req.params.id, tenantId: req.tenant.id });
    if (!dept) return res.status(404).json({ error: 'Department not found' });
    dept.streams = dept.streams.filter(s => s._id.toString() !== req.params.streamId);
    await dept.save();
    res.json(dept);
  } catch (error) { res.status(500).json({ error: 'Failed to delete stream' }); }
};

// ==========================================
// 5. SUBJECT CONTROLLER ACTIONS
// ==========================================

exports.getSubjects = async (req, res) => {
  try {
    const subjects = await Subject.find({ departmentId: req.params.deptId, tenantId: req.tenant.id }).sort({ code: 1 });
    res.json(subjects);
  } catch (error) { res.status(500).json({ error: 'Failed to fetch subjects' }); }
};

exports.createSubject = async (req, res) => {
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
};

exports.updateSubject = async (req, res) => {
    try {
        const { isActive } = req.body;
        const subject = await Subject.findOneAndUpdate({ _id: req.params.id, tenantId: req.tenant.id }, { isActive }, { new: true });
        res.json(subject);
    } catch (error) { res.status(500).json({ error: 'Failed to update subject' }); }
};

exports.deleteSubject = async (req, res) => {
    try {
        await Subject.findOneAndDelete({ _id: req.params.id, tenantId: req.tenant.id });
        res.json({ message: 'Subject deleted' });
    } catch (error) { res.status(500).json({ error: 'Failed to delete subject' }); }
};

exports.getDepartmentOverview = async (req, res) => {
  try {
    const dept = await Department.findOne({
      _id: req.params.id,
      tenantId: req.tenant.id
    });
    if (!dept) return res.status(404).json({ error: 'Department not found' });

    const subjects = await Subject.find({
      departmentId: dept._id,
      tenantId: req.tenant.id,
      isActive: true
    });

    res.json({ dept, subjects });
  } catch (error) { res.status(500).json({ error: error.message }); }
};
