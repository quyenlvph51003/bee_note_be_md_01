require("dotenv").config();
const { Resend } = require("resend");

// 🔍 Kiểm tra RESEND_API_KEY có tồn tại không
if (!process.env.RESEND_API_KEY) {
console.error("❌ ERROR: RESEND_API_KEY is missing from environment variables!");
}

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendMail(to, subject, text) {
try {
const result = await resend.emails.send({
from: "BeeNote [onboarding@resend.dev](mailto:onboarding@resend.dev)",
to,
subject,
text,
});

```
console.log("📧 Resend: Email sent!", result);
return result;
```

} catch (err) {
console.error("❌ Resend email error:", err);
throw err;
}
}

module.exports = { sendMail };
