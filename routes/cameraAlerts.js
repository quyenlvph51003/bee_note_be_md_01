const express = require("express");
const router = express.Router();
const { sendPushToUser } = require("../utils/sendPush");
const { pool } = require("../config/db");

router.post("/", async (req, res) => {
    try {
        const singleAlert = req.body;
        const alertsArray = [singleAlert]; // gói alert đơn lẻ thành array

        const user_id = 1; // Thay theo hệ thống của bạn
        const results = [];

        for (const alert of alertsArray) {
            const { type, confidence, image } = alert;
            if (!type || confidence === undefined) continue;

            // Lưu vào bảng alerts
            const [alertResult] = await pool.query(
                "INSERT INTO alerts (type, confidence, image) VALUES (?, ?, ?)",
                [type, confidence, image || null]
            );
            const alertId = alertResult.insertId;

            // Gửi push notification
            const title = "🐝 Có chuyển động lạ tại tổ ong!";
            const message = `Phát hiện ${type} gần tổ ong (độ tin cậy ${confidence.toFixed(2)})`;

            try {
                await sendPushToUser(user_id, title, message);
            } catch (err) {
                console.error("❌ Lỗi gửi push:", err);
            }

            results.push({ alertId, title, message });
        }

        res.json({ message: "Đã nhận, lưu và gửi thông báo", results });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Lỗi server" });
    }
});

module.exports = router;