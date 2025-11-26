const nodemailer = require('nodemailer');
require('dotenv').config();

async function sendMail(to, subject, text) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,  // Gmail bạn dùng để login SMTP
      pass: process.env.EMAIL_PASS,  // Mật khẩu ứng dụng 16 ký tự
    },
  });

  await transporter.sendMail({
    from: `"Bee Note" <${process.env.EMAIL_USER}>`, // phải trùng với user
    to,
    subject,
    text,
  });
}



module.exports = { sendMail };
