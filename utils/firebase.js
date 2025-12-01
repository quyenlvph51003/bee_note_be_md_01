const admin = require("firebase-admin");
const path = require("path");
const fs = require("fs");

// Đường dẫn tuyệt đối đến file JSON
const servicePath = path.resolve(__dirname, "../beenote-62baa-db992803b07b.json");

// Kiểm tra file tồn tại trước
if (!fs.existsSync(servicePath)) {
    console.error("❌ FILE JSON KHÔNG TỒN TẠI:", servicePath);
    process.exit(1);
}

const serviceAccount = require(servicePath);

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

module.exports = admin;
