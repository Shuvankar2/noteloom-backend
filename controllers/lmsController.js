const ClassModule = require('../models/ClassModule');
const ClassContent = require('../models/ClassContent');
const ContentProgress = require('../models/ContentProgress');
const Subject = require('../models/Subject');
const { deleteFromCloudinary } = require('../utils/cloudinaryHelper');

// ==========================================
// LMS CONTROLLER ACTIONS
// ==========================================

exports.getAllSubjects = async (req, res) => {
  try {
    const subjects = await Subject.find({ tenantId: req.tenant.id })
      .populate('departmentId', 'name streams') 
      .select('name code semester credits departmentId');

    const formattedSubjects = subjects.map(sub => ({
      _id: sub._id,
      name: sub.name,
      code: sub.code,
      semester: sub.semester,
      departmentName: sub.departmentId?.name || 'General',
      availableStreams: sub.departmentId?.streams || []
    }));

    res.json(formattedSubjects);
  } catch (error) { 
    console.error("Error fetching subjects:", error);
    res.status(500).json({ error: 'Failed to fetch subjects' }); 
  }
};

exports.getModules = async (req, res) => {
  try {
    const modules = await ClassModule.find({ classroomId: req.params.id }).sort({ order: 1 });
    res.json(modules);
  } catch (e) { res.status(500).json({ error: 'Failed to fetch modules' }); }
};

exports.createModule = async (req, res) => {
  try {
    if (req.role === 'student') return res.status(403).json({ error: 'Unauthorized' });
    const count = await ClassModule.countDocuments({ classroomId: req.params.id });
    const newModule = new ClassModule({ classroomId: req.params.id, title: req.body.title, order: count + 1 });
    await newModule.save();
    res.json(newModule);
  } catch (e) { res.status(500).json({ error: 'Failed to create module' }); }
};

exports.getModuleContent = async (req, res) => {
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
};

exports.uploadContent = async (req, res) => {
  try {
    if (req.role === 'student') return res.status(403).json({ error: 'Unauthorized' });
    const { title, description, type, videoUrl, allowDownload } = req.body;
    
    const attachments = req.files ? req.files.map(file => ({
      originalName: file.originalname,
      fileName: file.filename,
      fileUrl: file.path,
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
};

exports.getContentDetail = async (req, res) => {
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
};

exports.toggleDownload = async (req, res) => {
    try {
        if (req.role !== 'faculty') return res.status(403).json({ error: 'Unauthorized' });
        const content = await ClassContent.findById(req.params.id);
        content.allowDownload = !content.allowDownload;
        await content.save();
        res.json({ allowDownload: content.allowDownload });
    } catch(e) { res.status(500).json({ error: 'Error updating' }); }
};

exports.markComplete = async (req, res) => {
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
};

exports.deleteContent = async (req, res) => {
    try {
        if (req.role === 'student') return res.status(403).json({ error: 'Unauthorized' });
        
        const content = await ClassContent.findById(req.params.id);
        if (!content) return res.status(404).json({ error: 'Content not found' });
        
        // Deletes main file from Cloudinary
        if (content.fileUrl) {
            await deleteFromCloudinary(content.fileUrl);
        }
        
        // Deletes all attachments from Cloudinary
        if (content.attachments && Array.isArray(content.attachments)) {
            for (const attachment of content.attachments) {
                if (attachment.fileUrl) {
                    await deleteFromCloudinary(attachment.fileUrl);
                }
            }
        }
        
        await ClassContent.findByIdAndDelete(req.params.id);
        res.json({ message: 'Deleted' });
    } catch(e) { res.status(500).json({ error: 'Delete failed: ' + e.message }); }
};
