const { sendCameraAlert } = require("../utils/sendCameraAlert");

router.post("/", async (req, res) => {
    try {
        const { type, confidence, image } = req.body;

        if (!type || !confidence) {
            return res.status(400).json({ message: "Thiếu dữ liệu" });
        }

        // Lưu vào MySQL nếu bạn đã làm
        await pool.query(
            "INSERT INTO Alerts (type, confidence, image) VALUES (?, ?, ?)",
            [type, confidence, image]
        );

        // Lấy user_id của chủ trại (tương tự bên iot)
        const user_id = 1; // Tạm, bạn đổi theo hệ thống của bạn

        // 🔥 Gửi push notification lên app
        await sendCameraAlert({ user_id, type, confidence });

        res.json({ message: "Đã nhận và gửi push thông báo" });
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: "Lỗi server" });
    }
});