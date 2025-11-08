const express = require("express");
const router = express.Router();
const { pool } = require("../config/db");
const auth = require("../middleware/auth");
const authorize = require("../middleware/authorize");
const bcrypt = require("bcryptjs");

/* ===========================================================
   👥 USER ROUTES (ADMIN / KEEPER)
   =========================================================== */

/**
 * GET /api/users
 * ✅ ADMIN xem tất cả, KEEPER chỉ xem chính mình
 */
router.get("/", auth, authorize("ADMIN", "KEEPER"), async (req, res) => {
  try {
    const { role, user_id } = req.user;
    let sql = "SELECT user_id, username, full_name, email, phone, role, created_at, is_active FROM Users";
    let params = [];

    if (role === "KEEPER") {
      sql += " WHERE user_id = ?";
      params.push(user_id);
    }

    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error("❌ Lỗi GET /api/users:", err);
    res.status(500).json({ message: "Lỗi server", error: err.message });
  }
});

/**
 * POST /api/users
 * ✅ Chỉ ADMIN được thêm tài khoản mới
 */
router.post("/", auth, authorize("ADMIN"), async (req, res) => {
  try {
    const { username, password, full_name, email, phone, role = "KEEPER" } = req.body;

    if (!username || !password || !email || !full_name)
      return res.status(400).json({ message: "Thiếu thông tin bắt buộc" });

    const [dup] = await pool.query("SELECT user_id FROM Users WHERE username=? OR email=?", [username, email]);
    if (dup.length > 0)
      return res.status(409).json({ message: "Username hoặc email đã tồn tại" });

    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      `INSERT INTO Users (username, password, full_name, email, phone, role, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [username, hash, full_name, email, phone, role]
    );

    res.status(201).json({ message: "Tạo tài khoản thành công" });
  } catch (err) {
    console.error("❌ Lỗi POST /api/users:", err);
    res.status(500).json({ message: "Lỗi server", error: err.message });
  }
});

/**
 * PUT /api/users/:id
 * ✅ ADMIN có thể cập nhật thông tin người dùng
 */
router.put("/:id", auth, authorize("ADMIN"), async (req, res) => {
  try {
    const { id } = req.params;
    const { full_name, email, phone, role, is_active } = req.body;

    const [check] = await pool.query("SELECT * FROM Users WHERE user_id=?", [id]);
    if (check.length === 0)
      return res.status(404).json({ message: "Không tìm thấy người dùng" });

    await pool.query(
      `
      UPDATE Users
      SET full_name=?, email=?, phone=?, role=?, is_active=?
      WHERE user_id=?
      `,
      [full_name, email, phone, role, is_active, id]
    );

    res.json({ message: "Cập nhật người dùng thành công" });
  } catch (err) {
    console.error("❌ Lỗi PUT /api/users/:id:", err);
    res.status(500).json({ message: "Lỗi server", error: err.message });
  }
});

/**
 * DELETE /api/users/:id
 * ✅ Chỉ ADMIN được xóa tài khoản
 */
router.delete("/:id", auth, authorize("ADMIN"), async (req, res) => {
  try {
    const { id } = req.params;

    const [check] = await pool.query("SELECT * FROM Users WHERE user_id=?", [id]);
    if (check.length === 0)
      return res.status(404).json({ message: "Người dùng không tồn tại" });

    await pool.query("DELETE FROM Users WHERE user_id=?", [id]);
    res.json({ message: "Xóa tài khoản thành công" });
  } catch (err) {
    console.error("❌ Lỗi DELETE /api/users/:id:", err);
    res.status(500).json({ message: "Lỗi server", error: err.message });
  }
});

/**
 * PATCH /api/users/:id/password
 * ✅ ADMIN hoặc chính người đó có thể đổi mật khẩu
 */
router.patch("/:id/password", auth, authorize("ADMIN", "KEEPER"), async (req, res) => {
  try {
    const { id } = req.params;
    const { old_password, new_password } = req.body;

    if (!new_password)
      return res.status(400).json({ message: "Thiếu mật khẩu mới" });

    // Nếu là keeper → chỉ được đổi mật khẩu của chính mình
    if (req.user.role === "KEEPER" && req.user.user_id != id)
      return res.status(403).json({ message: "Không được đổi mật khẩu người khác" });

    const [rows] = await pool.query("SELECT password FROM Users WHERE user_id=?", [id]);
    if (rows.length === 0)
      return res.status(404).json({ message: "Không tìm thấy người dùng" });

    // Nếu không phải admin → kiểm tra mật khẩu cũ
    if (req.user.role !== "ADMIN") {
      const ok = await bcrypt.compare(old_password, rows[0].password);
      if (!ok) return res.status(401).json({ message: "Mật khẩu cũ không đúng" });
    }

    const hash = await bcrypt.hash(new_password, 10);
    await pool.query("UPDATE Users SET password=? WHERE user_id=?", [hash, id]);
    res.json({ message: "Đổi mật khẩu thành công" });
  } catch (err) {
    console.error("❌ Lỗi PATCH /api/users/:id/password:", err);
    res.status(500).json({ message: "Lỗi server", error: err.message });
  }
});

module.exports = router;
