const { sendPushToUser } = require("./sendPush");

async function sendCameraAlert({ user_id, type, confidence }) {
    let title = "🐝 Có chuyển động lạ tại tổ ong!";
    let message = "";

    switch (type) {
        case "person":
            message = `Phát hiện người lạ gần tổ ong (độ tin cậy ${confidence.toFixed(2)})`;
            break;

        case "dog":
            message = `Phát hiện chó gần tổ ong (độ tin cậy ${confidence.toFixed(2)})`;
            break;

        case "cat":
            message = `Phát hiện mèo gần tổ ong (độ tin cậy ${confidence.toFixed(2)})`;
            break;

        case "cow":
            message = `Phát hiện bò gần tổ ong (độ tin cậy ${confidence.toFixed(2)})`;
            break;

        case "buffalo":
            message = `Phát hiện trâu gần tổ ong (độ tin cậy ${confidence.toFixed(2)})`;
            break;

        default:
            message = `Phát hiện đối tượng lạ: ${type}`;
            break;
    }

    console.log("🚨 Camera alert:", title, message);

    await sendPushToUser(user_id, title, message);
}

module.exports = { sendCameraAlert };