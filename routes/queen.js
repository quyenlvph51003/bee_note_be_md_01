const express = require("express");
const router = express.Router();
const { pool } = require("../config/db");
const auth = require("../middleware/auth"); // ✅ Thêm middleware xác thực

// 🐝 1️⃣ Thêm ong chúa
router.post("/update", auth, async (req, res) => {
  try {
    const { name, hatch_date, reproductive_status, hive_id } = req.body;

    const [result] = await pool.query(
      "INSERT INTO queens (name, hatch_date, reproductive_status, hive_id) VALUES (?, ?, ?, ?)",
      [name, hatch_date, reproductive_status, hive_id]
    );

    res.status(201).json({
      message: "✅ Thêm ong chúa thành công",
      id: result.insertId,
      user: req.user, // 👈 Lưu ý: có thể kiểm tra ai là người thêm
    });
  } catch (err) {
    console.error("❌ Lỗi khi thêm ong chúa:", err);
    res.status(500).json({ message: "Lỗi server", error: err.message });
  }
});

// 🐝 2️⃣ Cập nhật ong chúa
router.put("/:id", auth, async (req, res) => {
  try {
    const { name, hatch_date, reproductive_status, hive_id } = req.body;

    const [result] = await pool.query(
      "UPDATE queens SET name=?, hatch_date=?, reproductive_status=?, hive_id=? WHERE id=?",
      [name, hatch_date, reproductive_status, hive_id, req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Không tìm thấy ong chúa" });
    }

    res.json({ message: "✅ Cập nhật ong chúa thành công" });
  } catch (err) {
    console.error("❌ Lỗi khi cập nhật:", err);
    res.status(500).json({ message: "Lỗi server", error: err.message });
  }
});

// 🐝 3️⃣ Xóa ong chúa
router.delete("/:id", auth, async (req, res) => {
  try {
    const [result] = await pool.query("DELETE FROM queens WHERE id = ?", [req.params.id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Không tìm thấy ong chúa" });
    }

    res.json({ message: "🗑️ Đã xóa ong chúa thành công" });
  } catch (err) {
    console.error("❌ Lỗi khi xóa ong chúa:", err);
    res.status(500).json({ message: "Lỗi server", error: err.message });
  }
});

module.exports = router;