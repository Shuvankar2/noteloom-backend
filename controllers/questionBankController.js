const QuestionBank = require('../models/QuestionBank');
const FacultyProfile = require('../models/FacultyProfile');
const AdminProfile = require('../models/AdminProfile');
const ITUserProfile = require('../models/ITUserProfile');
const ITAdminProfile = require('../models/ITAdminProfile');
const { deleteFromCloudinary } = require('../utils/cloudinaryHelper');

// 1. UPLOAD QUESTION
exports.uploadQuestion = async (req, res) => {
  try {
    const { facultyId, facultyName, subjectId, year, category, title } = req.body;
    if (!req.file || !title) return res.status(400).json({ error: 'File and Title required' });

    const question = new QuestionBank({
      tenantId: req.tenant.id, 
      facultyId, 
      facultyName, 
      subjectId, 
      title, 
      year, 
      category,
      fileUrl: req.file.path, 
      fileName: req.file.originalname
    });
    
    await question.save();
    res.json({ message: 'Success' });
  } catch (err) { 
    res.status(500).json({ error: err.message }); 
  }
};

// 2. GET QUESTIONS (Optimized to bulk-fetch profiles and avoid N+1 sequential loops)
exports.getQuestions = async (req, res) => {
  try {
    const { facultyId, tenantId, subjectId, year } = req.query;
    const filter = {};

    if (tenantId) filter.tenantId = tenantId;
    
    if (facultyId && facultyId !== 'undefined' && facultyId !== 'null') {
        filter.facultyId = facultyId;
    }

    if (subjectId && subjectId !== 'undefined') filter.subjectId = subjectId;
    if (year) filter.year = year;

    const questions = await QuestionBank.find(filter)
      .populate('subjectId', 'name code') 
      .populate('facultyId', 'name email role') 
      .lean()
      .sort({ uploadedAt: -1 });

    const uploaderIds = [...new Set(questions.map(q => q.facultyId?._id).filter(Boolean))];

    const [facultyProfiles, adminProfiles, itUserProfiles, itAdminProfiles] = await Promise.all([
      FacultyProfile.find({ userId: { $in: uploaderIds } }).select('userId uid employeeId').lean(),
      AdminProfile.find({ userId: { $in: uploaderIds } }).select('userId uid employeeId').lean(),
      ITUserProfile.find({ userId: { $in: uploaderIds } }).select('userId uid employeeId').lean(),
      ITAdminProfile.find({ userId: { $in: uploaderIds } }).select('userId uid employeeId').lean()
    ]);

    const profileMap = new Map();
    itAdminProfiles.forEach(p => { if (p.userId) profileMap.set(p.userId.toString(), p.uid || p.employeeId || 'N/A'); });
    itUserProfiles.forEach(p => { if (p.userId) profileMap.set(p.userId.toString(), p.uid || p.employeeId || 'N/A'); });
    adminProfiles.forEach(p => { if (p.userId) profileMap.set(p.userId.toString(), p.uid || p.employeeId || 'N/A'); });
    facultyProfiles.forEach(p => { if (p.userId) profileMap.set(p.userId.toString(), p.uid || p.employeeId || 'N/A'); });

    const formatted = questions.map((q) => {
       const subName = q.subjectId ? q.subjectId.name : 'Unknown Subject';
       const subCode = q.subjectId ? q.subjectId.code : 'N/A';
       
       let uid = 'N/A';
       const uploader = q.facultyId; 
       
       if (uploader && uploader._id) {
           uid = profileMap.get(uploader._id.toString()) || 'N/A';
       }

       return {
          _id: q._id,
          title: q.title,
          year: q.year,
          category: q.category,
          fileUrl: q.fileUrl,
          uploadedAt: q.uploadedAt,
          subjectName: subName,
          subjectCode: subCode,
          facultyName: uploader?.name || q.facultyName || 'Unknown',
          facultyUid: uid
       };
    });
    
    res.json(formatted);
  } catch (err) { 
    console.error("Error fetching questions:", err); 
    res.status(500).json({ error: err.message }); 
  }
};

// 3. DELETE QUESTION
exports.deleteQuestion = async (req, res) => {
    try {
        const question = await QuestionBank.findById(req.params.id);
        if (question) {
             // Deletes file from Cloudinary storage
             if (question.fileUrl) {
                 await deleteFromCloudinary(question.fileUrl);
             }
             await QuestionBank.findByIdAndDelete(req.params.id);
        }
        res.json({ success: true });
    } catch(e) { 
        res.status(500).json({ error: e.message }); 
    }
};
