const express = require("express");
const router = express.Router();
const { sendCameraAlert } = require("../utils/sendCameraAlert");
const { pool } = require("../config/db");

router.post("/", async (req, res) => {
    try {
        const { type, confidence, image } = req.body;

        if (!type || confidence === undefined) {
            return res.status(400).json({ message: "Thiếu dữ liệu 'type' hoặc 'confidence'" });
        }

        // Lưu vào MySQL
        const [result] = await pool.query(
            "INSERT INTO alerts (type, confidence, image) VALUES (?, ?, ?)",
            [type, confidence, image || null] // image có thể null
        );

        // Lấy ID bản ghi mới vừa tạo (nếu cần)
        const alertId = result.insertId;

        // 🔥 Gửi push notification lên app
        const user_id = 1; // Thay theo hệ thống của bạn
        await sendCameraAlert({ user_id, type, confidence, alertId });

        res.json({ message: "Đã nhận và gửi push thông báo", alertId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Lỗi server" });
    }
});

module.exports = router;