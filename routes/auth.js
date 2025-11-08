const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const { pool } = require('../config/db');
const { createAccessToken, createRefreshToken, verifyRefreshToken } = require('../utils/jwt');

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
// ✅ Đăng ký tài khoản
// -------------------------
router.post('/signup', async (req, res) => {
  try {
    const { username, password, full_name, email, phone, role } = req.body;
    if (!username || !password)
      return res.status(400).json({ message: 'Thiếu username hoặc password' });

    const [dup] = await pool.query(
      'SELECT user_id FROM Users WHERE username = ?',
      [username]
    );
    if (dup.length > 0)
      return res.status(409).json({ message: 'Username đã tồn tại' });

    const hash = await bcrypt.hash(password, 10);

    await pool.query(
      `
      INSERT INTO Users (username, password, full_name, email, phone, role, created_at)
      VALUES (?, ?, ?, ?, ?, ?, NOW())
      `,
      [
        username,
        hash,
        full_name || null,
        email || null,
        phone || null,
        role || 'KEEPER'
      ]
    );

    res.status(201).json({ message: 'Đăng ký thành công' });
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
      'SELECT * FROM Users WHERE username = ? LIMIT 1',
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

    // ✅ Lưu refresh token vào bảng Refresh_Tokens (không có revoked / expires_at)
    await pool.query(
      `
      INSERT INTO Refresh_Tokens (user_id, token)
      VALUES (?, ?)
      `,
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
// ✅ Refresh token
// -------------------------
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken)
      return res.status(400).json({ message: 'Thiếu refreshToken' });

    const decoded = verifyRefreshToken(refreshToken);

    // ✅ vì bảng không có revoked → chỉ cần kiểm tra tồn tại
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
// ✅ Logout
// -------------------------
router.post('/logout', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken)
      return res.status(400).json({ message: 'Thiếu refreshToken' });

    // ✅ vì không có revoked → ta xóa luôn token
    await pool.query(
      'DELETE FROM Refresh_Tokens WHERE token = ?',
      [refreshToken]
    );

    res.json({ message: 'Đã đăng xuất' });
  } catch (err) {
    console.error('Logout error:', err);
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
});

module.exports = router;
