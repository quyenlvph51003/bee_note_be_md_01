const { sendPushToUser } = require("./sendPush");

// ICON + MỨC NGUY HIỂM
const ALERT_CONFIG = {
    buffalo: { icon: "🐃", level: "🚨", text: "Phát hiện TRÂU cực kỳ nguy hiểm" },
    cow:     { icon: "🐄", level: "🚨", text: "Phát hiện BÒ cực kỳ nguy hiểm" },
    person:  { icon: "🧍‍♂️", level: "⚠️", text: "Phát hiện người gần tổ ong" },
    dog:     { icon: "🐕", level: "⚠️", text: "Phát hiện chó gần tổ ong" },
    cat:     { icon: "🐈", level: "⚠️", text: "Phát hiện mèo gần tổ ong" }
};

async function sendCameraAlert({ user_id, type, confidence, alertId }) {
    if (!ALERT_CONFIG[type]) return;

    const conf = typeof confidence === "number"
        ? confidence.toFixed(2)
        : "N/A";

    const cfg = ALERT_CONFIG[type];

    const title = `${cfg.level} CẢNH BÁO KHẨN CẤP TỔ ONG`;

    let message = `${cfg.icon} ${cfg.text} (độ tin cậy ${conf})`;

    if (alertId) {
        message += ` • ID #${alertId}`;
    }

    console.log(`🚨 Camera alert [${type}]`, message);

    await sendPushToUser(user_id, title, message);
}

module.exports = { sendCameraAlert };