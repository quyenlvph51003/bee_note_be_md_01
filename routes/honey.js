const express = require("express");
const router = express.Router();
const { pool } = require("../config/db");
const auth = require("../middleware/auth"); // ✅ xác thực token

// 1️⃣ Ghi nhận sản lượng mật từng tổ
router.post("/", auth, async (req, res) => {
  try {
    const { hive_id, date, amount, note } = req.body;

    if (!hive_id || !date || !amount) {
      return res.status(400).json({
        message: "Thiếu dữ liệu bắt buộc (hive_id, date, amount)",
      });
    }

    const [result] = await pool.query(
      `INSERT INTO honeys (hive_id, date, amount, note)
       VALUES (?, ?, ?, ?)`,
      [hive_id, date, amount, note || null]
    );

    res.status(201).json({
      message: "✅ Ghi nhận sản lượng mật thành công",
      id: result.insertId,
    });
  } catch (err) {
    console.error("❌ Lỗi ghi nhận sản lượng:", err);
    res.status(500).json({
      message: "Lỗi server khi ghi nhận sản lượng mật",
      error: err.sqlMessage || err.message,
    });
  }
});

// 2️⃣ Cập nhật bản ghi sản lượng theo ID
router.put("/:id", auth, async (req, res) => {
  try {
    const { hive_id, date, amount, note } = req.body;

    const [result] = await pool.query(
      `UPDATE honeys
       SET hive_id=?, date=?, amount=?, note=?
       WHERE id=?`,
      [hive_id, date, amount, note, req.params.id]
    );

    if (result.affectedRows === 0)
      return res.status(404).json({ message: "Không tìm thấy bản ghi" });

    res.json({ message: "✅ Cập nhật sản lượng mật thành công" });
  } catch (err) {
    console.error("❌ Lỗi cập nhật:", err);
    res.status(500).json({
      message: "Lỗi server khi cập nhật sản lượng mật",
      error: err.sqlMessage || err.message,
    });
  }
});

// 3️⃣ Xóa bản ghi sản lượng
router.delete("/:id", auth, async (req, res) => {
  try {
    const [result] = await pool.query(
      "DELETE FROM honeys WHERE id = ?",
      [req.params.id]
    );

    if (result.affectedRows === 0)
      return res.status(404).json({ message: "Không tìm thấy bản ghi" });

    res.json({ message: "🗑️ Đã xóa bản ghi sản lượng" });
  } catch (err) {
    console.error("❌ Lỗi xóa:", err);
    res.status(500).json({
      message: "Lỗi server khi xóa bản ghi sản lượng mật",
      error: err.sqlMessage || err.message,
    });
  }
});

module.exports = router;