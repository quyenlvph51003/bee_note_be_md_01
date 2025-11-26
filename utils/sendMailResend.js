const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

async function sendMail(to, subject, text) {
  try {
    await resend.emails.send({
      from: "BeeNote <onboarding@resend.dev>",
      to,
      subject,
      text,
    });

    console.log("📧 Resend: email sent!");
  } catch (err) {
    console.error("❌ Resend email error:", err.message);
  }
}

module.exports = { sendMail };
