const express = require("express");
const router = express.Router();
const { sendPushToUser } = require("../utils/sendPush");
const { pool } = require("../config/db");

/**
 * POST /camera-alerts
 * Body: { alerts: [ { type, confidence, image } ] }
 */
router.post("/", async (req, res) => {
    try {
        const alertsArray = req.body.alerts;

        if (!Array.isArray(alertsArray) || alertsArray.length === 0) {
            return res.status(400).json({ message: "Thiếu dữ liệu alerts" });
        }

        const user_id = 1; // Thay theo hệ thống của bạn
        const results = [];

        for (const alert of alertsArray) {
            const { type, confidence, image } = alert;

            if (!type || confidence === undefined) continue;

            // 1️⃣ Lưu vào bảng alerts cũ
            const [alertResult] = await pool.query(
                "INSERT INTO alerts (type, confidence, image) VALUES (?, ?, ?)",
                [type, confidence, image || null]
            );
            const alertId = alertResult.insertId;

            // 2️⃣ Lưu vào iot_alerts (bảng tổng hợp)
            const titleMap = {
                person: "🐝 Có chuyển động lạ tại tổ ong!",
                dog: "🐝 Có chuyển động lạ tại tổ ong!",
                cat: "🐝 Có chuyển động lạ tại tổ ong!",
                cow: "🐝 Có chuyển động lạ tại tổ ong!",
                buffalo: "🐝 Có chuyển động lạ tại tổ ong!"
            };
            const title = titleMap[type] || "🐝 Phát hiện đối tượng lạ!";
            const message = `Phát hiện ${type} gần tổ ong (độ tin cậy ${confidence.toFixed(2)})`;

            await pool.query(
                `INSERT INTO iot_alerts (user_id, device_id, type, title, message, status, created_at)
                 VALUES (?, ?, ?, ?, ?, 'unread', NOW())`,
                [user_id, null, "CAMERA_ALERT", title, message]
            );

            // 3️⃣ Gửi push notification
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