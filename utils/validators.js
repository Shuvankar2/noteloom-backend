const { z } = require('zod');

// 1. User Sign In Schema
const signinSchema = z.object({
  body: z.object({
    email: z.string().email("Invalid email format"),
    password: z.string().min(6, "Password must be at least 6 characters")
  })
});

// 2. User Sign Up Schema
const signupSchema = z.object({
  body: z.object({
    email: z.string().email("Invalid email format"),
    username: z.string().min(3, "Username must be at least 3 characters").optional(),
    password: z.string().min(6, "Password must be at least 6 characters"),
    name: z.string().min(2, "Name must be at least 2 characters"),
    role: z.enum(['student', 'faculty', 'college_admin']).default('student'),
    collegeCode: z.string().regex(/^\d{4}$/, "College code must be exactly 4 digits")
  })
});

// 3. Leave Application Schema
const leaveSchema = z.object({
  body: z.object({
    leaveType: z.enum(['Casual', 'Sick', 'Duty', 'Maternity', 'Paternity', 'Loss of Pay'], {
      errorMap: () => ({ message: "Leave type must be Casual, Sick, Duty, Maternity, Paternity, or Loss of Pay" })
    }),
    startDate: z.string().refine(val => !isNaN(Date.parse(val)), { message: "Invalid start date format" }),
    endDate: z.string().refine(val => !isNaN(Date.parse(val)), { message: "Invalid end date format" }),
    reason: z.string().min(10, "Reason must be at least 10 characters long")
  }).refine(data => Date.parse(data.endDate) >= Date.parse(data.startDate), {
    message: "End date must be greater than or equal to start date",
    path: ["endDate"]
  })
});

module.exports = {
  signinSchema,
  signupSchema,
  leaveSchema
};
