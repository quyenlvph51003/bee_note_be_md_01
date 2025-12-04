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

// const { sendPushToUser } = require("./sendPush");

// const THRESHOLD = {
//     HIGH_TEMP: 35,
//     LOW_HUMI: 40,
// };

// async function sendIotAlert({ device_id, temp, humi, user_id }) {
//     let title = "";
//     let message = "";

//     if (temp > THRESHOLD.HIGH_TEMP) {
//         title = "🔥 Cảnh báo nhiệt độ cao!";
//         message = `Thiết bị ${device_id} nóng tới ${temp}°C`;
//     }

//     if (humi < THRESHOLD.LOW_HUMI) {
//         title = "💧 Độ ẩm quá thấp!";
//         message = `Thiết bị ${device_id} chỉ còn ${humi}% độ ẩm`;
//     }

//     if (!title) return;

//     await sendPushToUser(user_id, title, message);

//     console.log("📨 IoT alert sent:", title);
// }

// module.exports = { sendIotAlert };

// const { sendPushToUser } = require("./sendPush");

// const THRESHOLD = {
//     HIGH_TEMP: 20,
//     LOW_HUMI: 40,
// };

// async function sendIotAlert({ device_id, temp, humi, user_id }) {
//     const alerts = [];

//     if (temp > THRESHOLD.HIGH_TEMP) {
//         alerts.push({
//             title: "🔥 Cảnh báo nhiệt độ cao!",
//             message: `Thiết bị ${device_id} nóng tới ${temp}°C`
//         });
//     }

//     if (humi < THRESHOLD.LOW_HUMI) {
//         alerts.push({
//             title: "💧 Độ ẩm quá thấp!",
//             message: `Thiết bị ${device_id} chỉ còn ${humi}% độ ẩm`
//         });
//     }

//     for (const alert of alerts) {
//         await sendPushToUser(user_id, alert.title, alert.message);
//         console.log("📨 IoT alert sent:", alert.title);
//     }
// }

// module.exports = { sendIotAlert };


// const { sendPushToUser } = require("./sendPush");

// const THRESHOLD = {
//     HIGH_TEMP: 20,
//     LOW_HUMI: 40,
// };

// const ALERT_COOLDOWN_MS = 5 * 60 * 1000; // 5 phút

// // Lưu trạng thái từng cảnh báo theo device + user + loại alert
// // key: `${user_id}:${device_id}:${type}`
// // value: { lastStatus: "OK" | "ALERT", lastAlertAt: number }
// const alertState = new Map();

// function getKey(user_id, device_id, type) {
//     return `${user_id || "unknown"}:${device_id || "unknown"}:${type}`;
// }

// async function sendIotAlert({ device_id, temp, humi, user_id }) {
//     const now = Date.now();
//     const alerts = [];

//     // Xác định các loại alert hiện tại
//     const isHighTemp = temp > THRESHOLD.HIGH_TEMP;
//     const isLowHumi = humi < THRESHOLD.LOW_HUMI;

//     if (isHighTemp) {
//         alerts.push({
//             type: "HIGH_TEMP",
//             title: "🔥 Cảnh báo nhiệt độ cao!",
//             message: `Thiết bị ${device_id} nóng tới ${temp}°C`,
//         });
//     }

//     if (isLowHumi) {
//         alerts.push({
//             type: "LOW_HUMI",
//             title: "💧 Độ ẩm quá thấp!",
//             message: `Thiết bị ${device_id} chỉ còn ${humi}% độ ẩm`,
//         });
//     }

//     // Xử lý từng loại alert
//     for (const alert of alerts) {
//         const key = getKey(user_id, device_id, alert.type);
//         const state = alertState.get(key) || { lastStatus: "OK", lastAlertAt: 0 };

//         const wasOk = state.lastStatus === "OK";
//         const timeSinceLast = now - state.lastAlertAt;

//         let shouldSend = false;

//         if (wasOk) {
//             // Vừa từ trạng thái OK sang ALERT -> gửi ngay
//             shouldSend = true;
//         } else if (timeSinceLast >= ALERT_COOLDOWN_MS) {
//             // Đang ALERT liên tục nhưng đã qua 5 phút -> gửi lại
//             shouldSend = true;
//         }

//         if (shouldSend) {
//             await sendPushToUser(user_id, alert.title, alert.message);
//             console.log("📨 IoT alert sent:", alert.title);
//             alertState.set(key, { lastStatus: "ALERT", lastAlertAt: now });
//         } else {
//             // Không gửi nhưng vẫn cập nhật trạng thái là ALERT
//             alertState.set(key, { lastStatus: "ALERT", lastAlertAt: state.lastAlertAt });
//             console.log("⏱ Bỏ qua alert (cooldown):", alert.title);
//         }
//     }

//     // Nếu hiện tại không còn vượt ngưỡng thì reset trạng thái về OK
//     if (!isHighTemp) {
//         const key = getKey(user_id, device_id, "HIGH_TEMP");
//         const state = alertState.get(key);
//         if (state && state.lastStatus !== "OK") {
//             alertState.set(key, { ...state, lastStatus: "OK" });
//         }
//     }

//     if (!isLowHumi) {
//         const key = getKey(user_id, device_id, "LOW_HUMI");
//         const state = alertState.get(key);
//         if (state && state.lastStatus !== "OK") {
//             alertState.set(key, { ...state, lastStatus: "OK" });
//         }
//     }
// }

// module.exports = { sendIotAlert };

const { sendPushToUser } = require("./sendPush");
const { pool } = require("../config/db");

const THRESHOLD = {
  HIGH_TEMP: 20,
  LOW_HUMI: 40,
};

const ALERT_COOLDOWN_MS = 5 * 60 * 1000; // 5 phút

// Lưu trạng thái từng cảnh báo theo device + user + loại alert
// key: `${user_id}:${device_id}:${type}`
// value: { lastStatus: "OK" | "ALERT", lastAlertAt: number }
const alertState = new Map();

function getKey(user_id, device_id, type) {
  return `${user_id || "unknown"}:${device_id || "unknown"}:${type}`;
}

// Lưu thông báo vào DB để app đọc lịch sử
async function saveIotAlertToDb({ user_id, device_id, type, title, message }) {
  try {
    await pool.query(
      `INSERT INTO iot_alerts (user_id, device_id, type, title, message)
       VALUES (?, ?, ?, ?, ?)`,
      [user_id, device_id, type, title, message]
    );
  } catch (err) {
    console.error("❌ saveIotAlertToDb error:", err);
  }
}

async function sendIotAlert({ device_id, temp, humi, user_id }) {
  const now = Date.now();
  const alerts = [];

  // Xác định các loại alert hiện tại
  const isHighTemp = temp > THRESHOLD.HIGH_TEMP;
  const isLowHumi = humi < THRESHOLD.LOW_HUMI;

  if (isHighTemp) {
    alerts.push({
      type: "HIGH_TEMP",
      title: "🔥 Cảnh báo nhiệt độ cao!",
      message: `Thiết bị ${device_id} nóng tới ${temp}°C`,
    });
  }

  if (isLowHumi) {
    alerts.push({
      type: "LOW_HUMI",
      title: "💧 Độ ẩm quá thấp!",
      message: `Thiết bị ${device_id} chỉ còn ${humi}% độ ẩm`,
    });
  }

  // Xử lý từng loại alert
  for (const alert of alerts) {
    const key = getKey(user_id, device_id, alert.type);
    const state = alertState.get(key) || { lastStatus: "OK", lastAlertAt: 0 };

    const wasOk = state.lastStatus === "OK";
    const timeSinceLast = now - state.lastAlertAt;

    let shouldSend = false;

    if (wasOk) {
      // Vừa từ trạng thái OK sang ALERT -> gửi ngay
      shouldSend = true;
    } else if (timeSinceLast >= ALERT_COOLDOWN_MS) {
      // Đang ALERT liên tục nhưng đã qua 5 phút -> gửi lại
      shouldSend = true;
    }

    if (shouldSend) {
      // 1) Gửi push
      await sendPushToUser(user_id, alert.title, alert.message);
      console.log("📨 IoT alert sent:", alert.title);

      // 2) Lưu DB cho màn thông báo trong app
      await saveIotAlertToDb({
        user_id,
        device_id,
        type: alert.type,
        title: alert.title,
        message: alert.message,
      });

      // 3) Cập nhật trạng thái
      alertState.set(key, { lastStatus: "ALERT", lastAlertAt: now });
    } else {
      // Không gửi nhưng vẫn giữ trạng thái ALERT
      alertState.set(key, { lastStatus: "ALERT", lastAlertAt: state.lastAlertAt });
      console.log("⏱ Bỏ qua alert (cooldown):", alert.title);
    }
  }

  // Nếu hiện tại không còn vượt ngưỡng thì reset trạng thái về OK
  if (!isHighTemp) {
    const key = getKey(user_id, device_id, "HIGH_TEMP");
    const state = alertState.get(key);
    if (state && state.lastStatus !== "OK") {
      alertState.set(key, { ...state, lastStatus: "OK" });
    }
  }

  if (!isLowHumi) {
    const key = getKey(user_id, device_id, "LOW_HUMI");
    const state = alertState.get(key);
    if (state && state.lastStatus !== "OK") {
      alertState.set(key, { ...state, lastStatus: "OK" });
    }
  }
}

module.exports = { sendIotAlert };
