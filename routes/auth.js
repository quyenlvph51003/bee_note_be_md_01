const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const { pool } = require('../config/db');
const { createAccessToken, createRefreshToken, verifyRefreshToken } = require('../utils/jwt');
const auth = require('../middleware/auth');




const { sendMail } = require('../utils/sendMailResend');


router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Thiếu email' });

    const [rows] = await pool.query('SELECT user_id FROM Users WHERE email = ? LIMIT 1', [email]);
    if (rows.length === 0) return res.status(404).json({ message: 'Email không tồn tại' });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = Date.now() + 5 * 60 * 1000;   // 5 phút

    await pool.query(
      'UPDATE Users SET reset_otp = ?, reset_expires = ? WHERE email = ?',
      [otp, expires, email]
    );

    await sendMail(email, 'OTP Reset Password', `Mã OTP của bạn là: ${otp}`);

    res.json({ message: 'Đã gửi OTP vào Gmail!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const { email, newPassword } = req.body;
    if (!email || !newPassword)
      return res.status(400).json({ message: 'Thiếu email hoặc mật khẩu mới' });

    const hash = await bcrypt.hash(newPassword, 10);

    await pool.query(
      `UPDATE Users 
       SET password = ?, reset_otp = NULL, reset_expires = NULL 
       WHERE email = ?`,
      [hash, email]
    );

    res.json({ message: 'Đổi mật khẩu thành công!' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
});



// -------------------------
// 🧮 Hàm tính thời gian hết hạn (ví dụ "30d")
// -------------------------
function ms(str) {
  const m = /^(\d+)([smhd])$/.exec(str || '30d');
  if (!m) return 0;
  const n = +m[1];
  return { s: 1e3, m: 6e4, h: 36e5, d: 864e5 }[m[2]] * n;
}

// -------------------------
// ✅ Đăng ký tài khoản (chỉ role = KEEPER)
// -------------------------
// router.post('/signup', async (req, res) => {
//   try {
//     const { username, password, full_name, email, phone } = req.body;
//     if (!username || !password)
//       return res.status(400).json({ message: 'Thiếu username hoặc password' });

//     // Kiểm tra trùng username hoặc email
//     const [dup] = await pool.query(
//       'SELECT user_id FROM Users WHERE username = ? OR email = ? LIMIT 1',
//       [username, email]
//     );
//     if (dup.length > 0)
//       return res.status(409).json({ message: 'Username hoặc email đã tồn tại' });

//     const hash = await bcrypt.hash(password, 10);

//     // ✅ Mặc định role là KEEPER
//     await pool.query(
//       `
//       INSERT INTO Users (username, password, full_name, email, phone, role, created_at)
//       VALUES (?, ?, ?, ?, ?, 'KEEPER', NOW())
//       `,
//       [username, hash, full_name || null, email || null, phone || null]
//     );

//     res.status(201).json({ message: 'Đăng ký thành công (vai trò: KEEPER)' });
//   } catch (err) {
//     console.error('Signup error:', err);
//     res.status(500).json({ message: 'Lỗi server', error: err.message });
//   }
// });
router.post('/signup', async (req, res) => {
  try {
    const { username, password, full_name, email, phone } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: 'Thiếu username hoặc password' });
    }

    // 🔎 Kiểm tra trùng username hoặc email
    const [dup] = await pool.query(
      'SELECT user_id FROM Users WHERE username = ? OR email = ? LIMIT 1',
      [username, email]
    );

    if (dup.length > 0) {
      return res.status(409).json({ message: 'Username hoặc email đã tồn tại' });
    }

    const hash = await bcrypt.hash(password, 10);

    // ✅ Luôn set mặc định ROLE & PACKAGE TYPE
    await pool.query(
      `
      INSERT INTO Users 
      (username, password, full_name, email, phone, role, package_type, package_expired_at, created_at)
      VALUES (?, ?, ?, ?, ?, 'KEEPER', 'free', NULL, NOW())
      `,
      [
        username,
        hash,
        full_name || null,
        email || null,
        phone || null
      ]
    );

    res.status(201).json({ 
      success: true,
      message: 'Đăng ký thành công (vai trò: KEEPER, gói FREE)' 
    });

  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
});


// -------------------------
// ✅ Đăng nhập
// -------------------------
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ message: 'Thiếu username/password' });

    const [rows] = await pool.query(
      'SELECT * FROM Users WHERE username = ? AND is_active = 1 LIMIT 1',
      [username]
    );

    if (rows.length === 0)
      return res.status(401).json({ message: 'Sai thông tin đăng nhập' });

    const user = rows[0];
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ message: 'Sai mật khẩu' });

    const payload = {
      user_id: user.user_id,
      username: user.username,
      role: user.role
    };

    const accessToken = createAccessToken(payload);
    const refreshToken = createRefreshToken(payload);

    // ✅ Lưu refresh token
    await pool.query(
      `INSERT INTO Refresh_Tokens (user_id, token) VALUES (?, ?)`,
      [user.user_id, refreshToken]
    );

    res.json({
      message: 'Đăng nhập thành công',
      accessToken,
      refreshToken,
      user: {
        id: user.user_id,
        username: user.username,
        full_name: user.full_name,
        email: user.email,
        role: user.role
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
});

// -------------------------
// 🔄 Refresh token
// -------------------------
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken)
      return res.status(400).json({ message: 'Thiếu refreshToken' });

    const decoded = verifyRefreshToken(refreshToken);

    const [rows] = await pool.query(
      'SELECT token_id FROM Refresh_Tokens WHERE token = ? LIMIT 1',
      [refreshToken]
    );

    if (rows.length === 0)
      return res.status(401).json({ message: 'Refresh token không hợp lệ' });

    const newAccessToken = createAccessToken({
      user_id: decoded.user_id,
      username: decoded.username,
      role: decoded.role
    });

    res.json({ accessToken: newAccessToken });
  } catch (err) {
    console.error('Refresh error:', err);
    res.status(401).json({ message: 'Refresh token không hợp lệ hoặc hết hạn' });
  }
});

// -------------------------
// 🚪 Logout
// -------------------------
router.post('/logout', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken)
      return res.status(400).json({ message: 'Thiếu refreshToken' });

    await pool.query('DELETE FROM Refresh_Tokens WHERE token = ?', [refreshToken]);
    res.json({ message: 'Đã đăng xuất' });
  } catch (err) {
    console.error('Logout error:', err);
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
});

// -------------------------
// 🔒 ADMIN: Cập nhật role người dùng
// -------------------------
router.put('/set-role/:id', auth, async (req, res) => {
  try {
    if (req.user.role !== 'ADMIN')
      return res.status(403).json({ message: 'Bạn không có quyền thực hiện thao tác này' });

    const { id } = req.params;
    const { role } = req.body;

    if (!['ADMIN', 'MANAGER', 'KEEPER', 'VIEWER'].includes(role))
      return res.status(400).json({ message: 'Role không hợp lệ' });

    await pool.query('UPDATE Users SET role = ? WHERE user_id = ?', [role, id]);
    res.json({ message: `Cập nhật quyền thành công: ${role}` });
  } catch (err) {
    console.error('Set role error:', err);
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
});

module.exports = router;
