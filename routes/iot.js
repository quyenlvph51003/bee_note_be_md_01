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

module.exports = router;


