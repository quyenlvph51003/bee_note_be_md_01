// // middleware/auth.js
// const { verifyAccessToken } = require('../utils/jwt');

// module.exports = (req, res, next) => {
//   const header = req.headers.authorization || '';
//   const token = header.startsWith('Bearer ') ? header.slice(7) : null;

//   if (!token) return res.status(401).json({ message: 'Thiếu access token' });

//   try {
//     req.user = verifyAccessToken(token);
//     next();
//   } catch (err) {
//     res.status(401).json({ message: 'Token không hợp lệ hoặc đã hết hạn' });
//   }
// };
// middleware/auth.js
const { verifyAccessToken } = require('../utils/jwt');
const { pool } = require('../config/db');

module.exports = async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: 'Thiếu access token' });
  }

  try {
    const decoded = verifyAccessToken(token);   // { user_id, role, ... }

    // ✅ Lấy thông tin mới nhất từ DB
    const [rows] = await pool.query(
      `SELECT user_id, username, email, role, package_type, package_expired_at
       FROM Users
       WHERE user_id = ?`,
      [decoded.user_id]
    );

    if (rows.length === 0) {
      return res.status(401).json({ message: 'User không tồn tại' });
    }

    // Gán user vào request
    req.user = rows[0];

    next();

  } catch (err) {
    console.error("AUTH ERROR:", err.message);
    res.status(401).json({ message: 'Token không hợp lệ hoặc đã hết hạn' });
  }
};
