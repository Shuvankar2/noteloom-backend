/**
 * NoteLoom Backend — Email Templates
 */

const getVerificationEmailHtml = (code) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; }
        .verification-code { font-size: 32px; font-weight: bold; color: #667eea; text-align: center; padding: 20px; background: white; border-radius: 10px; margin: 20px 0; letter-spacing: 5px; }
        .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
        .warning { background: #fff3cd; border: 1px solid #ffeeba; color: #856404; padding: 15px; border-radius: 5px; margin: 20px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🎓 Note Loom</h1>
          <p>Exams Made Simple</p>
        </div>
        <div class="content">
          <h2>Sign Up - Email Verification Required</h2>
          <p>Hello!</p>
          <p>Thank you for signing up with Note Loom. To complete your registration, please use the verification code below:</p>
          
          <div class="verification-code">${code}</div>
          
          <p><strong>This code will expire in 10 minutes.</strong></p>
          
          <div class="warning">
            <strong>⚠️ Security Notice:</strong>
            <ul>
              <li>Never share this code with anyone</li>
              <li>If you didn't request this code, please ignore this email</li>
            </ul>
          </div>
          
          <p>Best regards,<br><strong>The Note Loom Team</strong></p>
        </div>
        <div class="footer">
          <p>© 2025 Note Loom. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

const getOverdueBookAlertHtml = (studentName, bookTitle, copyId, dueDate, daysOverdue, fineAmount) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #e53e3e 0%, #9b2c2c 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; }
        .details-box { background: white; border-radius: 10px; padding: 20px; margin: 20px 0; border-left: 5px solid #e53e3e; }
        .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🎓 Note Loom Library</h1>
          <p>Overdue Book Notice</p>
        </div>
        <div class="content">
          <p>Dear ${studentName},</p>
          <p>This is a notice that a book issued to you from the college library is now overdue. Please return the book as soon as possible to avoid further accumulation of fines.</p>
          
          <div class="details-box">
            <p><strong>Book Title:</strong> ${bookTitle}</p>
            <p><strong>Copy ID:</strong> ${copyId}</p>
            <p><strong>Due Date:</strong> ${new Date(dueDate).toDateString()}</p>
            <p><strong>Days Overdue:</strong> ${daysOverdue}</p>
            <p><strong>Current Fine:</strong> ₹${fineAmount}</p>
          </div>
          
          <p>Fines accumulate daily at a rate of ₹10/day. Please contact the library administrator to return the book and settle the fine.</p>
          
          <p>Best regards,<br><strong>Note Loom Library Administrator</strong></p>
        </div>
        <div class="footer">
          <p>© 2026 Note Loom. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

module.exports = {
  getVerificationEmailHtml,
  getOverdueBookAlertHtml
};
