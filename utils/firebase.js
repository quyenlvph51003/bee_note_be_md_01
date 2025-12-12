// const admin = require("firebase-admin");
// const path = require("path");
// const fs = require("fs");

// // Đường dẫn tuyệt đối đến file JSON
// const servicePath = path.resolve(__dirname, "../beenote-62baa-db992803b07b.json");

// // Kiểm tra file tồn tại trước
// if (!fs.existsSync(servicePath)) {
//     console.error("❌ FILE JSON KHÔNG TỒN TẠI:", servicePath);
//     process.exit(1);
// }

// const serviceAccount = require(servicePath);

// admin.initializeApp({
//     credential: admin.credential.cert(serviceAccount),
// });

// module.exports = admin;

// utils/firebaseAdmin.js
const admin = require("firebase-admin");

if (!process.env.FIREBASE_ADMIN_JSON) {
  console.error("FIREBASE_ADMIN_JSON is not set");
  process.exit(1);
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(process.env.FIREBASE_ADMIN_JSON);
} catch (e) {
  console.error("Cannot parse FIREBASE_ADMIN_JSON:", e);
  process.exit(1);
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

module.exports = admin;