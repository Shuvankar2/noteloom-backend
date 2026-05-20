const Student = require('../models/Student'); // Import your actual Student model
const Exam = require('../models/Exam');       // Import your Exam/TimeTable model
const Payment = require('../models/Payment'); // Import your Fee/Payment model

exports.getAdmitCardDashboard = async (req, res) => {
  try {
    // 1. Get the logged-in student's ID from the request (set by your Auth Middleware)
    const studentId = req.user.id; 

    // 2. Fetch Student Details
    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    // 3. Generate Semester History (Logic for "LOCKED", "PAID", "GENERATED")
    // We assume an 8-semester course. We check past sems vs current sem.
    const currentSem = student.currentSemester || 1; 
    const history = [];

    for (let i = 1; i <= 8; i++) {
      let status = "LOCKED";
      let payment = "NA";
      let isCurrent = false;

      if (i < currentSem) {
        status = "GENERATED"; // Past semesters are always generated
        payment = "PAID";
      } else if (i === currentSem) {
        isCurrent = true;
        // Check if they have paid for this semester
        const hasPaid = await Payment.findOne({ 
          studentId: studentId, 
          semester: i, 
          status: 'success' 
        });

        if (hasPaid) {
          status = "GENERATED";
          payment = "PAID";
        } else {
          status = "PENDING";
          payment = "UNPAID";
        }
      }

      history.push({
        id: i,
        label: `Semester ${i}`,
        session: `${i % 2 === 0 ? 'Even' : 'Odd'} Sem ${new Date().getFullYear()}`,
        status,
        payment,
        isCurrent,
        isBacklog: false // You can add logic here to check for backlogs if you have that data
      });
    }

    // 4. Fetch Exam Schedule (Only for the current/active semester)
    const exams = await Exam.find({
      stream: student.stream,       // e.g., "CSE"
      semester: currentSem,
      batch: student.batchYear      // Optional: exact batch matching
    }).sort({ date: 1 });

    // Format exams for the frontend
    const formattedSchedule = exams.map(exam => ({
      date: new Date(exam.date).toLocaleDateString('en-GB'), // e.g., "10 March 2026"
      day: new Date(exam.date).toLocaleDateString('en-US', { weekday: 'long' }),
      time: `${exam.startTime} - ${exam.endTime}`,
      code: exam.subjectCode,
      subject: exam.subjectName,
      type: "REGULAR" 
    }));

    // 5. Send the Response
    res.status(200).json({
      candidate: {
        name: student.fullName,
        program: student.course || "B.Tech",
        stream: student.stream,
        registrationNo: student.registrationNo,
        examRollNo: student.rollNo,
        examCenter: "Main Block, Salt Lake Campus", // Hardcoded or fetch from DB
        centerCode: "IEM-SL-01",
        applicationNo: `APP${student.rollNo}`,
        photoUrl: student.profilePicture || "" 
      },
      history: history,
      schedule: formattedSchedule,
      instructions: [
        "This Admit Card is electronically generated.",
        "Report to the center 30 minutes before the exam.",
        "Mobile phones are strictly prohibited."
      ]
    });

  } catch (error) {
    console.error("Admit Card Error:", error);
    res.status(500).json({ message: "Server Error" });
  }
};