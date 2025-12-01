// const sendPushToAll = require("./sendPush");  // dùng OneSignal segment "All"

// const THRESHOLD = {
//     HIGH_TEMP: 35,
//     LOW_HUMI: 40
// };

// async function sendIotAlert({ device_id, temp, humi }) {
//     let title = "";
//     let message = "";

//     if (temp > THRESHOLD.HIGH_TEMP) {
//         title = "🔥 Cảnh báo nhiệt độ cao!";
//         message = `Thiết bị ${device_id}: ${temp}°C`;
//     }

//     if (humi < THRESHOLD.LOW_HUMI) {
//         title = "💧 Độ ẩm thấp!";
//         message = `Thiết bị ${device_id}: ${humi}%`;
//     }

//     if (!title) return;

//     await sendPushToAll(title, message); // gửi tới tất cả user

//     console.log("📨 IoT Alert Sent:", title);
// }

// module.exports = { sendIotAlert };

// const sendPush = require("./sendPush");

// const THRESHOLD = {
//   HIGH_TEMP: 35,
//   LOW_HUMI: 40,
// };

// async function sendIotAlert({ device_id, temp, humi }) {
//   try {
//     let title = "";
//     let message = "";

//     if (temp > THRESHOLD.HIGH_TEMP) {
//       title = "🔥 Cảnh báo nhiệt độ cao!";
//       message = `Thiết bị ${device_id}: Nhiệt độ lên tới ${temp}°C`;
//     }

//     if (humi < THRESHOLD.LOW_HUMI) {
//       title = "💧 Độ ẩm thấp!";
//       message = `Thiết bị ${device_id}: Độ ẩm chỉ ${humi}%`;
//     }

//     if (!title) return;

//     await sendPush(title, message);

//     console.log("📨 IoT alert sent:", title);

//   } catch (err) {
//     console.log("❌ sendIotAlert error:", err);
//   }
// }

// module.exports = { sendIotAlert };

const { sendPushToUser } = require("./sendPush");

const THRESHOLD = {
    HIGH_TEMP: 35,
    LOW_HUMI: 40,
};

async function sendIotAlert({ device_id, temp, humi, user_id }) {
    let title = "";
    let message = "";

    if (temp > THRESHOLD.HIGH_TEMP) {
        title = "🔥 Cảnh báo nhiệt độ cao!";
        message = `Thiết bị ${device_id} nóng tới ${temp}°C`;
    }

    if (humi < THRESHOLD.LOW_HUMI) {
        title = "💧 Độ ẩm quá thấp!";
        message = `Thiết bị ${device_id} chỉ còn ${humi}% độ ẩm`;
    }

    if (!title) return;

    await sendPushToUser(user_id, title, message);

    console.log("📨 IoT alert sent:", title);
}

module.exports = { sendIotAlert };


