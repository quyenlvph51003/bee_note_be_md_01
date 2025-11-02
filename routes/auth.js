const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const { poolPromise, sql } = require('../config/db');
const { createAccessToken, createRefreshToken, verifyRefreshToken } = require('../utils/jwt');

// 🧮 Hàm tính thời gian hết hạn (ví dụ "30d")
function ms(str) {
  const m = /^(\d+)([smhd])$/.exec(str || '30d');
  if (!m) return 0;
  const n = +m[1];
  return { s: 1e3, m: 6e4, h: 36e5, d: 864e5 }[m[2]] * n;
}

// -------------------------
// 🟢 Đăng ký tài khoản
// -------------------------
router.post('/signup', async (req, res) => {
  const { username, password, full_name, email, phone, role } = req.body;
  if (!username || !password)
    return res.status(400).json({ message: 'Thiếu username hoặc password' });

  try {
    const pool = await poolPromise;

    // Kiểm tra trùng username
    const dup = await pool
      .request()
      .input('u', sql.VarChar, username)
      .query('SELECT user_id FROM dbo.Users WHERE username=@u');
    if (dup.recordset.length)
      return res.status(409).json({ message: 'Username đã tồn tại' });

    // Mã hóa mật khẩu
    const hash = await bcrypt.hash(password, 10);

    // Thêm user mới
    await pool
      .request()
      .input('username', sql.VarChar, username)
      .input('password', sql.VarChar, hash) // 👉 chỉ lưu hash vào cột password
      .input('full_name', sql.NVarChar, full_name || null)
      .input('email', sql.VarChar, email || null)
      .input('phone', sql.VarChar, phone || null)
      .input('role', sql.VarChar, role || 'beekeeper')
      .query(`
        INSERT INTO dbo.Users (username, password, full_name, email, phone, role, created_at)
        VALUES (@username, @password, @full_name, @email, @phone, @role, GETDATE())
      `);

    res.status(201).json({ message: 'Đăng ký thành công' });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
});

// -------------------------
// 🟢 Đăng nhập
// -------------------------
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ message: 'Thiếu username/password' });

  try {
    const pool = await poolPromise;
    const rs = await pool
      .request()
      .input('u', sql.VarChar, username)
      .query('SELECT TOP 1 * FROM dbo.Users WHERE username=@u');

    if (!rs.recordset.length)
      return res.status(401).json({ message: 'Sai thông tin đăng nhập' });

    const user = rs.recordset[0];

    // So sánh mật khẩu
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ message: 'Sai mật khẩu' });

    // Tạo JWT
    const payload = { user_id: user.user_id, username: user.username, role: user.role };
    const accessToken = createAccessToken(payload);
    const refreshToken = createRefreshToken(payload);

    // Lưu refresh token vào DB
    await pool
      .request()
      .input('uid', sql.Int, user.user_id)
      .input('token', sql.VarChar, refreshToken)
      .input('exp', sql.DateTime2, new Date(Date.now() + ms(process.env.JWT_REFRESH_EXPIRES || '30d')))
      .query(`
        INSERT INTO dbo.REFRESH_TOKEN (user_id, token, expires_at)
        VALUES (@uid, @token, @exp)
      `);

    res.json({
      message: 'Đăng nhập thành công',
      accessToken,
      refreshToken,
      user: {
        id: user.user_id,
        username: user.username,
        full_name: user.full_name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
});

// -------------------------
// 🟢 Refresh token
// -------------------------
router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ message: 'Thiếu refreshToken' });

  try {
    const decoded = verifyRefreshToken(refreshToken);
    const pool = await poolPromise;
    const rs = await pool
      .request()
      .input('t', sql.VarChar, refreshToken)
      .query('SELECT revoked FROM dbo.REFRESH_TOKEN WHERE token=@t');
    if (!rs.recordset.length || rs.recordset[0].revoked)
      return res.status(401).json({ message: 'Refresh token không hợp lệ' });

    const newAccess = createAccessToken({
      user_id: decoded.user_id,
      username: decoded.username,
      role: decoded.role,
    });
    res.json({ accessToken: newAccess });
  } catch (err) {
    console.error('Refresh token error:', err);
    res.status(401).json({ message: 'Refresh token không hợp lệ hoặc hết hạn' });
  }
});

// -------------------------
// 🟢 Logout
// -------------------------
router.post('/logout', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ message: 'Thiếu refreshToken' });

  try {
    const pool = await poolPromise;
    await pool.request().input('t', sql.VarChar, refreshToken)
      .query('UPDATE dbo.REFRESH_TOKEN SET revoked=1 WHERE token=@t');
    res.json({ message: 'Đã đăng xuất' });
  } catch (err) {
    console.error('Logout error:', err);
    res.status(500).json({ message: 'Lỗi server' });
  }
});

module.exports = router;
