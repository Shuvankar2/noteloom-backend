const nodemailer = require('nodemailer');
const { getVerificationEmailHtml } = require('../templates/emailTemplates');

// Reusable transporter — created once at module load, not per email
const emailTransporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

const sendEmail = async (email, code) => {
  try {
    const mailOptions = {
      from: `"Note Loom" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: `Note Loom - Sign Up Email Verification Code`,
      html: getVerificationEmailHtml(code)
    };

    await emailTransporter.sendMail(mailOptions);
    console.log(`✅ Email sent successfully to: ${email}`);
    return true;
  } catch (error) {
    console.error('❌ Email sending failed:', error);
    throw new Error('Failed to send verification email');
  }
};

module.exports = {
  sendEmail
};
