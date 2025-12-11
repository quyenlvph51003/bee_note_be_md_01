// const express = require('express');
// const router = express.Router();
// const { pool } = require('../config/db');
// const { sendIotAlert } = require('../utils/iotNotificationService');   // IMPORT SERVICE

// // ==============================================
// // 1) ESP32 gửi dữ liệu cảm biến
// // ==============================================
// router.post('/sensor', async (req, res) => {
//     try {
//         const { device_id, temp, humi } = req.body;

//         // Validate input
//         if (!device_id || temp === undefined || humi === undefined) {
//             return res.status(400).json({
//                 status: false,
//                 message: "Missing fields"
//             });
//         }

//         // Save to database
//         await pool.execute(
//             `INSERT INTO iot_sensor (device_id, temperature, humidity)
//              VALUES (?, ?, ?)`,
//             [device_id, temp, humi]
//         );

//         // Gửi cảnh báo bằng OneSignal
//         await sendIotAlert({ device_id, temp, humi });

//         return res.json({
//             status: true,
//             message: "Sensor saved"
//         });

//     } catch (err) {
//         console.log("❌ IOT SENSOR ERROR:", err);
//         return res.status(500).json({ status: false });
//     }
// });


// // ==============================================
// // 2) Lấy dữ liệu mới nhất cho mobile
// // ==============================================
// router.get('/latest', async (req, res) => {
//     try {
//         const [rows] = await pool.execute(
//             `SELECT * FROM iot_sensor ORDER BY id DESC LIMIT 1`
//         );

//         return res.json({
//             status: true,
//             data: rows[0] || null
//         });

//     } catch (error) {
//         console.log("❌ IOT LATEST ERROR:", error);
//         res.status(500).json({ status: false });
//     }
// });


// module.exports = router;

const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { sendIotAlert } = require('../utils/iotNotificationService');
const auth = require("../middleware/auth");

// // ==============================================
// // 1) ESP32 gửi dữ liệu cảm biến
// // ==============================================
// router.post('/sensor', async (req, res) => {
//     try {
//         const { device_id, temp, humi } = req.body;

//         if (!device_id || temp === undefined || humi === undefined) {
//             return res.status(400).json({
//                 status: false,
//                 message: "Missing fields"
//             });
//         }

//         // Lưu DB
//         await pool.execute(
//             `INSERT INTO iot_sensor (device_id, temperature, humidity)
//              VALUES (?, ?, ?)`,
//             [device_id, temp, humi]
//         );

//         // Gửi cảnh báo FCM (nếu có)
//         await sendIotAlert({ device_id, temp, humi });

//         return res.json({
//             status: true,
//             message: "Sensor saved"
//         });

//     } catch (err) {
//         console.log("❌ IOT SENSOR ERROR:", err);
//         return res.status(500).json({ status: false });
//     }
// });
// ESP32 gửi dữ liệu
router.post("/sensor", async (req, res) => {
    try {
        const { device_id, temp, humi, user_id } = req.body;

        if (!device_id || temp === undefined || humi === undefined || !user_id) {
            return res.status(400).json({
                status: false,
                message: "Missing fields",
            });
        }

        await pool.execute(
            `INSERT INTO iot_sensor (device_id, temperature, humidity)
             VALUES (?, ?, ?)`,
            [device_id, temp, humi]
        );

        await sendIotAlert({ device_id, temp, humi, user_id });

        res.json({
            status: true,
            message: "Sensor saved",
        });

    } catch (err) {
        console.error("❌ IOT SENSOR ERROR:", err);
        res.status(500).json({ status: false });
    }
});

// ==============================================
// 2) Lấy dữ liệu mới nhất cho mobile
// ==============================================
router.get('/latest', async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT * FROM iot_sensor ORDER BY id DESC LIMIT 1`
        );

        return res.json({
            status: true,
            data: rows[0] || null
        });

    } catch (error) {
        console.log("❌ IOT LATEST ERROR:", error);
        res.status(500).json({ status: false });
    }
});

// // =====================================================
// // 3) Lấy danh sách cảnh báo IoT cho mobile
// //    GET /api/iot/alerts?page=1&limit=20
// // =====================================================
// router.get("/alerts", auth, async (req, res) => {
//   try {
//     const userId = req.user.user_id; // lấy từ token
//     const page = parseInt(req.query.page || "1", 10);
//     const limit = parseInt(req.query.limit || "20", 10);
//     const offset = (page - 1) * limit;

//     const [rows] = await pool.execute(
//       `SELECT id, device_id, type, title, message, status, created_at, read_at
//        FROM iot_alerts
//        WHERE user_id = ?
//        ORDER BY created_at DESC
//        LIMIT ? OFFSET ?`,
//       [userId, limit, offset]
//     );

//     const [countRows] = await pool.execute(
//       `SELECT COUNT(*) AS total
//        FROM iot_alerts
//        WHERE user_id = ?`,
//       [userId]
//     );

//     const total = countRows[0]?.total || 0;

//     return res.json({
//       status: true,
//       data: rows,
//       pagination: {
//         page,
//         limit,
//         total,
//       },
//     });
//   } catch (error) {
//     console.error("❌ IOT ALERTS LIST ERROR:", error);
//     res.status(500).json({ status: false, message: "Server error" });
//   }
// });

// // =====================================================
// // 4) Đánh dấu 1 cảnh báo là đã đọc
// //    PATCH /api/iot/alerts/:id/read
// // =====================================================
// router.patch("/alerts/:id/read", auth, async (req, res) => {
//   try {
//     const userId = req.user.user_id;
//     const { id } = req.params;

//     const [result] = await pool.execute(
//       `UPDATE iot_alerts
//        SET status = 'read', read_at = NOW()
//        WHERE id = ? AND user_id = ?`,
//       [id, userId]
//     );

//     if (result.affectedRows === 0) {
//       return res.status(404).json({ status: false, message: "Alert not found" });
//     }

//     return res.json({ status: true, message: "Marked as read" });
//   } catch (error) {
//     console.error("❌ IOT ALERT READ ERROR:", error);
//     res.status(500).json({ status: false, message: "Server error" });
//   }
// });

// // =====================================================
// // 5) Đánh dấu TẤT CẢ cảnh báo của user là đã đọc
// //    PATCH /api/iot/alerts/read-all
// // =====================================================
// router.patch("/alerts/read-all", auth, async (req, res) => {
//   try {
//     const userId = req.user.user_id;

//     await pool.execute(
//       `UPDATE iot_alerts
//        SET status = 'read', read_at = NOW()
//        WHERE user_id = ? AND status = 'unread'`,
//       [userId]
//     );

//     return res.json({ status: true, message: "All alerts marked as read" });
//   } catch (error) {
//     console.error("❌ IOT ALERT READ-ALL ERROR:", error);
//     res.status(500).json({ status: false, message: "Server error" });
//   }
// });

// =====================================================
// GET /api/iot/alerts?page=1&limit=20
// =====================================================
router.get("/alerts", auth, async (req, res) => {
  try {
    const userId = req.user.user_id;

    let page = Number(req.query.page);
    let limit = Number(req.query.limit);

    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(limit) || limit < 1) limit = 20;

    const offset = (page - 1) * limit;

    // 🚀 FIX: KHÔNG dùng LIMIT ? OFFSET ?
    const query = `
      SELECT id, device_id, type, title, message, status, created_at, read_at
      FROM iot_alerts
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const [rows] = await pool.execute(query, [userId]);

    const [countRows] = await pool.execute(
      `SELECT COUNT(*) AS total FROM iot_alerts WHERE user_id = ?`,
      [userId]
    );

    return res.json({
      status: true,
      data: rows,
      pagination: {
        page,
        limit,
        total: countRows[0]?.total || 0,
      },
    });
  } catch (error) {
    console.error("❌ IOT ALERTS LIST ERROR:", error);
    res.status(500).json({ status: false, message: "Server error" });
  }
});


// =====================================================
// PATCH /api/iot/alerts/:id/read
// =====================================================
router.patch("/alerts/:id/read", auth, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const id = Number(req.params.id);

    const [result] = await pool.execute(
      `UPDATE iot_alerts
       SET status = 'read', read_at = NOW()
       WHERE id = ? AND user_id = ?`,
      [id, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ status: false, message: "Alert not found" });
    }

    return res.json({ status: true, message: "Marked as read" });
  } catch (error) {
    console.error("❌ IOT ALERT READ ERROR:", error);
    res.status(500).json({ status: false, message: "Server error" });
  }
});

// =====================================================
// PATCH /api/iot/alerts/read-all
// =====================================================
router.patch("/alerts/read-all", auth, async (req, res) => {
  try {
    const userId = req.user.user_id;

    await pool.execute(
      `UPDATE iot_alerts
       SET status = 'read', read_at = NOW()
       WHERE user_id = ? AND status = 'unread'`,
      [userId]
    );

    return res.json({ status: true, message: "All alerts marked as read" });
  } catch (error) {
    console.error("❌ IOT ALERT READ-ALL ERROR:", error);
    res.status(500).json({ status: false, message: "Server error" });
  }
});


module.exports = router;


