const { sendPushToUser } = require("./sendPush");

async function sendCameraAlert({ user_id, type, confidence, alertId }) {
    let title = "🐝 Có chuyển động lạ tại tổ ong!";
    let conf = (typeof confidence === "number") ? confidence.toFixed(2) : "N/A";

    let message = "";

    switch (type) {
        case "person":
            message = `Phát hiện người lạ gần tổ ong (độ tin cậy ${conf})`;
            break;
        case "dog":
            message = `Phát hiện chó gần tổ ong (độ tin cậy ${conf})`;
            break;
        case "cat":
            message = `Phát hiện mèo gần tổ ong (độ tin cậy ${conf})`;
            break;
        case "cow":
            message = `Phát hiện bò gần tổ ong (độ tin cậy ${conf})`;
            break;
        case "buffalo":
            message = `Phát hiện trâu gần tổ ong (độ tin cậy ${conf})`;
            break;
        default:
            message = `Phát hiện đối tượng lạ: ${type}`;
            break;
    }

    if (alertId) {
        message += ` (Alert ID: ${alertId})`;
    }

    console.log(`🚨 Camera alert [user_id=${user_id}]:`, title, message);

    await sendPushToUser(user_id, title, message);
}

module.exports = { sendCameraAlert };