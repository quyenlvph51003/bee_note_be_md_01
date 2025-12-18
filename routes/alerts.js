const express = require("express");
const router = express.Router();
const { sendCameraAlert } = require("../utils/sendCameraAlert");
const { pool } = require("../config/db");

/**
 * ======================================
 * POST /api/alerts
 * Nhận cảnh báo từ camera AI và lưu MySQL
 * ======================================
 */
router.post("/", async (req, res) => {
    try {
        const { type, confidence, image } = req.body;

        if (!type || confidence === undefined) {
            return res.status(400).json({
                message: "Thiếu dữ liệu 'type' hoặc 'confidence'"
            });
        }

        // Lưu cảnh báo vào MySQL
        const [result] = await pool.query(
            "INSERT INTO alerts (type, confidence, image) VALUES (?, ?, ?)",
            [type, confidence, image || null]
        );

        const alertId = result.insertId;

        // Gửi push notification (tuỳ hệ thống user)
        const { user_id } = req.body;
        await sendCameraAlert({ user_id, type, confidence, alertId });

        res.json({
            message: "Đã nhận cảnh báo & gửi push notification",
            alertId
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Lỗi server" });
    }
});

/**
 * ======================================
 * GET /api/alerts
 * Lấy danh sách cảnh báo từ MySQL
 * ======================================
 */
router.get("/", async (req, res) => {
    try {
        const { type, limit = 50 } = req.query;

        let sql = `
            SELECT 
                id,
                type,
                confidence,
                image,
                created_at
            FROM alerts
        `;

        const params = [];

        if (type) {
            sql += " WHERE type = ?";
            params.push(type);
        }

        sql += " ORDER BY created_at DESC LIMIT ?";
        params.push(Number(limit));

        const [rows] = await pool.query(sql, params);

        res.json({
            total: rows.length,
            alerts: rows
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Lỗi server" });
    }
});

module.exports = router;