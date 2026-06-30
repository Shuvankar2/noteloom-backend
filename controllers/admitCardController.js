const StudentProfile = require('../models/StudentProfile');
const ExamSession = require('../models/ExamSession');
const StudentExamForm = require('../models/StudentExamForm');
const Subject = require('../models/Subject');

/**
 * GET /api/coe/admit-card/:studentUserId
 * Returns the admit card dashboard data for a student.
 * Uses actual project models: StudentProfile, ExamSession, StudentExamForm, Subject.
 */
exports.getAdmitCardDashboard = async (req, res) => {
  try {
    const studentUserId = req.params.studentUserId || req.user?.id;
    const tenantId = req.tenant?.id;

    // 1. Fetch Student Profile
    const profile = await StudentProfile.findOne({ userId: studentUserId, tenantId })
      .populate('userId', 'name email')
      .populate({
        path: 'batchId',
        populate: { path: 'departmentId' }
      });

    if (!profile) {
      return res.status(404).json({ message: 'Student profile not found' });
    }

    const currentSem = profile.batchId?.currentTerm || profile.currentSemester || 1;
    const batch = profile.batchId;
    const dept = batch?.departmentId;

    // 2. Build semester history (8-semester course assumption)
    const allForms = await StudentExamForm.find({
      studentId: studentUserId,
      tenantId,
      paymentStatus: 'Paid'
    }).populate('sessionId', 'sessionName year cycle');

    const history = [];
    for (let i = 1; i <= 8; i++) {
      let status = 'LOCKED';
      let payment = 'NA';
      const isCurrent = i === currentSem;

      if (i < currentSem) {
        status = 'GENERATED';
        payment = 'PAID';
      } else if (isCurrent) {
        // Check if student has a paid form for the active session
        const activeSession = await ExamSession.findOne({ tenantId, isActive: true });
        const hasPaid = activeSession
          ? allForms.some(f => f.sessionId && f.sessionId._id.toString() === activeSession._id.toString())
          : false;

        if (hasPaid) {
          status = 'GENERATED';
          payment = 'PAID';
        } else {
          status = 'PENDING';
          payment = 'UNPAID';
        }
      }

      history.push({
        id: i,
        label: `Semester ${i}`,
        session: `${i % 2 === 0 ? 'Even' : 'Odd'} Sem ${new Date().getFullYear()}`,
        status,
        payment,
        isCurrent,
        isBacklog: false
      });
    }

    // 3. Fetch subjects for the current semester (exam schedule)
    let subjects = [];
    if (dept) {
      subjects = await Subject.find({
        departmentId: dept._id,
        semester: currentSem,
        isActive: true
      }).select('name code type').sort({ code: 1 });
    }

    // Format as a schedule
    const formattedSchedule = subjects.map(sub => ({
      code: sub.code,
      subject: sub.name,
      type: sub.type ? sub.type.toUpperCase() : 'REGULAR'
    }));

    // 4. Send response
    res.status(200).json({
      candidate: {
        name: profile.userId?.name || 'N/A',
        program: profile.course || 'B.Tech',
        stream: dept?.name || profile.stream || 'N/A',
        registrationNo: profile.uid || 'N/A',
        examRollNo: profile.rollNo || 'N/A',
        examCenter: 'Main Block', // Can be made configurable via SystemConfig
        centerCode: 'N/A',
        applicationNo: profile.rollNo ? `APP${profile.rollNo}` : 'N/A',
        photoUrl: profile.profilePicture || ''
      },
      history,
      schedule: formattedSchedule,
      instructions: [
        'This Admit Card is electronically generated.',
        'Report to the center 30 minutes before the exam.',
        'Mobile phones are strictly prohibited.',
        'Bring a valid college ID along with this admit card.'
      ]
    });

  } catch (error) {
    console.error('Admit Card Error:', error);
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};