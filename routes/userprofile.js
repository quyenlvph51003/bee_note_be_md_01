const express = require("express");
const router = express.Router();
const { pool } = require("../config/db");
const multer = require("multer");
const path = require("path");

// Multer config: upload avatar
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "public/uploads/avatars");
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `avatar_${Date.now()}${ext}`);
  },
});
const upload = multer({ storage });


// -------------------------------------------
// PUT: Update fullname + phone (BẢNG USERS)
// -------------------------------------------
router.put("/info/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { full_name, phone } = req.body;

    // Kiểm tra user tồn tại
    const [users] = await pool.query(
      "SELECT * FROM Users WHERE user_id = ?",
      [id]
    );

    if (users.length === 0) {
      return res.status(404).json({ message: "Không tìm thấy user" });
    }

    // Cập nhật vào bảng USERS
    await pool.query(
      "UPDATE Users SET full_name = ?, phone = ? WHERE user_id = ?",
      [full_name, phone, id]
    );

    res.json({ message: "Cập nhật thông tin user thành công" });

  } catch (err) {
    res.status(500).json({ message: "Lỗi server", detail: err.message });
  }
});


// -------------------------------------------
// PUT: Update avatar (BẢNG USERPROFILES)
// -------------------------------------------
router.put("/avatar/:id", upload.single("avatar"), async (req, res) => {
  try {
    const { id } = req.params;
    const avatar = `/uploads/avatars/${req.file.filename}`;

    // Kiểm tra profile tồn tại hay chưa
    const [profile] = await pool.query(
      "SELECT * FROM UserProfiles WHERE user_id = ?",
      [id]
    );

    if (profile.length > 0) {
      // Update avatar
      await pool.query(
        "UPDATE UserProfiles SET avatar = ? WHERE user_id = ?",
        [avatar, id]
      );
      return res.json({
        message: "Cập nhật avatar thành công",
        avatar,
      });
    }

    // Nếu chưa có thì tạo mới
    await pool.query(
      "INSERT INTO UserProfiles (user_id, avatar) VALUES (?, ?)",
      [id, avatar]
    );

    res.json({
      message: "Tạo profile mới thành công",
      avatar,
    });

  } catch (err) {
    res.status(500).json({ message: "Lỗi server", detail: err.message });
  }
});


// -------------------------------------------
// GET: Lấy thông tin chi tiết user + profile
// JOIN 2 bảng
// -------------------------------------------
router.get("/detail/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await pool.query(
      `SELECT 
        Users.user_id,
        Users.full_name,
        Users.phone,
        UserProfiles.avatar,
        Users.created_at
      FROM Users
      LEFT JOIN UserProfiles ON Users.user_id = UserProfiles.user_id
      WHERE Users.user_id = ?`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        message: "Không tìm thấy user",
      });
    }

    res.json({
      message: "Lấy thông tin người dùng thành công",
      profile: rows[0],
    });

  } catch (err) {
    res.status(500).json({
      message: "Lỗi server",
      detail: err.message,
    });
  }
});


module.exports = router;
