const router = require("express").Router();
const { pool } = require("../config/db");

// Nhận cảnh báo từ Python
router.post("/", async (req, res) => {
  try {
    const { type, confidence, image } = req.body;

    if (!type || !confidence) {
      return res.status(400).json({ message: "Thiếu dữ liệu 'type' hoặc 'confidence'" });
    }

    const sql = `
      INSERT INTO alerts (type, confidence, image)
      VALUES (?, ?, ?)
    `;

    await pool.query(sql, [type, confidence, image || null]);

    res.json({ message: "Đã lưu cảnh báo thành công!" });
  } catch (e) {
    console.error("Lỗi API /alerts:", e);
    res.status(500).json({ message: "Server lỗi" });
  }
});

module.exports = router;