const express = require("express");
const router = express.Router();
const { pool } = require("../config/db");
const auth = require("../middleware/auth"); // ✅ import middleware xác thực

//  1️ Thêm cầu ong mới
router.post("/", auth, async (req, res) => {
  try {
    const { hive_id, frame_type, honey_yield, note } = req.body;

    if (!hive_id)
      return res.status(400).json({ message: "Thiếu hive_id" });

    const [result] = await pool.query(
      `INSERT INTO frames (hive_id, frame_type, honey_yield, note)
       VALUES (?, ?, ?, ?)`,
      [hive_id, frame_type || null, honey_yield || 0, note || null]
    );

    res.status(201).json({
      message: "✅ Thêm cầu ong thành công",
      id: result.insertId,
      user: req.user, // 👈 Có thể log user từ token nếu cần
    });
  } catch (err) {
    console.error("❌ Lỗi thêm cầu ong:", err);
    res.status(500).json({
      message: "Lỗi server khi thêm cầu ong",
      error: err.sqlMessage || err.message,
    });
  }
});

//  2️ Cập nhật cầu ong theo ID
router.put("/:id", auth, async (req, res) => {
  try {
    const { hive_id, frame_type, honey_yield, note } = req.body;

    const [result] = await pool.query(
      `UPDATE frames
       SET hive_id=?, frame_type=?, honey_yield=?, note=?
       WHERE id=?`,
      [hive_id, frame_type, honey_yield, note, req.params.id]
    );

    if (result.affectedRows === 0)
      return res.status(404).json({ message: "Không tìm thấy cầu ong" });

    res.json({ message: "✅ Cập nhật cầu ong thành công" });
  } catch (err) {
    console.error("❌ Lỗi cập nhật:", err);
    res.status(500).json({
      message: "Lỗi server khi cập nhật cầu ong",
      error: err.sqlMessage || err.message,
    });
  }
});

//  3️ Xóa cầu ong
router.delete("/:id", auth, async (req, res) => {
  try {
    const [result] = await pool.query(
      "DELETE FROM frames WHERE id = ?",
      [req.params.id]
    );

    if (result.affectedRows === 0)
      return res.status(404).json({ message: "Không tìm thấy cầu ong" });

    res.json({ message: "🗑️ Đã xóa cầu ong" });
  } catch (err) {
    console.error("❌ Lỗi xóa cầu ong:", err);
    res.status(500).json({
      message: "Lỗi server khi xóa cầu ong",
      error: err.sqlMessage || err.message,
    });
  }
});

module.exports = router;