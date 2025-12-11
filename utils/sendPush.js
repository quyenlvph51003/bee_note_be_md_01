// const axios = require("axios");

// async function sendPushToAll(title, message) {
//     try {
//         const APP_ID = process.env.ONESIGNAL_APP_ID;
//         const API_KEY = process.env.ONESIGNAL_REST_API_KEY;

//         const body = {
//             app_id: APP_ID,
//             included_segments: ["All"],   // KHÔNG CẦN player_id
//             headings: { en: title },
//             contents: { en: message }
//         };

//         await axios.post(
//             "https://onesignal.com/api/v1/notifications",
//             body,
//             {
//                 headers: {
//                     Authorization: `Basic ${API_KEY}`,
//                     "Content-Type": "application/json"
//                 }
//             }
//         );

//         console.log("📨 OneSignal push sent to ALL");

//     } catch (err) {
//         console.log("❌ OneSignal error:", err.response?.data || err);
//     }
// }

// module.exports = sendPushToAll;

// const admin = require("./firebase");

// // Gửi FCM theo topic (broadcast)
// async function sendPush(title, body, topic = "beehive") {
//   try {
//     const message = {
//       notification: {
//         title,
//         body
//       },
//       topic
//     };

//     const response = await admin.messaging().send(message);
//     console.log("📨 FCM push sent:", response);

//   } catch (error) {
//     console.log("❌ sendPush error:", error);
//   }
// }

// module.exports = sendPush;

const admin = require("./firebase");
const { pool } = require("../config/db");

// Gửi thông báo cho một user theo user_id
async function sendPushToUser(user_id, title, body) {
    try {
        const [rows] = await pool.execute(
            `SELECT fcm_token FROM Users WHERE user_id = ? LIMIT 1`,
            [user_id]
        );

        if (rows.length === 0 || !rows[0].fcm_token) {
            console.log("❌ User has no FCM token");
            return;
        }

        const token = rows[0].fcm_token;

        const message = {
            notification: {
                title,
                body,
            },
            token: token,
        };

        const response = await admin.messaging().send(message);
        console.log("📨 FCM push sent:", response);

    } catch (err) {
        console.error("❌ sendPushToUser error:", err);
    }
}

module.exports = { sendPushToUser };


