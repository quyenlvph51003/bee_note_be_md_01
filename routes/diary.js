// routes/diary.routes.js
const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { verifyAccessToken } = require('../utils/jwt');

// ====================
// CẤU HÌNH TÊN BẢNG (CHỈ SỬA 1 CHỖ)
// ====================
const TABLE_NAME = 'diarys'; // THAY ĐỔI TÊN BẢNG Ở ĐÂY

// -------------------------
//// Middleware: Kiểm tra token
// -------------------------
const auth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Thiếu token' });
  }

  const token = authHeader.split(' ')[1];
  try {
    req.user = verifyAccessToken(token);
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Token không hợp lệ hoặc hết hạn' });
  }
};

// -------------------------
//// 1. Thêm nhật ký chăm sóc mới
// -------------------------
router.post('/add', auth, async (req, res) => {
  try {
    const {
      hive_id,
      check_date,
      status = 'healthy',
      weather,
      temperature,
      humidity,
      actions,
      notes
    } = req.body;

    if (!hive_id) {
      return res.status(400).json({ message: 'Thiếu hive_id' });
    }

    // Kiểm tra tổ ong tồn tại
    const [hive] = await pool.query('SELECT hive_id FROM Hives WHERE hive_id = ?', [hive_id]);
    if (hive.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy tổ ong' });
    }

    const [result] = await pool.query(
      `INSERT INTO ${TABLE_NAME} 
         (hive_id, check_date, status, weather, temperature, humidity, actions, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        hive_id,
        check_date || new Date().toISOString().slice(0, 10),
        status,
        weather ?? null,
        temperature ?? null,
        humidity ?? null,
        actions ?? null,
        notes ?? null
      ]
    );

    res.status(201).json({
      message: 'Thêm nhật ký chăm sóc thành công',
      diary_id: result.insertId
    });
  } catch (err) {
    console.error('Add diary error:', err);
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
});

// -------------------------
//// 2. Lấy danh sách nhật ký
// -------------------------
router.get('/list', auth, async (req, res) => {
  try {
    const { hive_id, start_date, end_date, page = 1, limit = 20 } = req.query;

    let where = 'WHERE 1=1';
    const params = [];

    if (hive_id) {
      where += ' AND d.hive_id = ?';
      params.push(hive_id);
    }
    if (start_date) {
      where += ' AND d.check_date >= ?';
      params.push(start_date);
    }
    if (end_date) {
      where += ' AND d.check_date <= ?';
      params.push(end_date);
    }

    const offset = (page - 1) * limit;

    const query = `
      SELECT 
        d.*,
        h.hive_name,
        h.location
      FROM ${TABLE_NAME} d
      LEFT JOIN Hives h ON d.hive_id = h.hive_id
      ${where}
      ORDER BY d.check_date DESC, d.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const countQuery = `SELECT COUNT(*) as total FROM ${TABLE_NAME} d ${where}`;

    const [rows] = await pool.query(query, [...params, Number(limit), offset]);
    const [countResult] = await pool.query(countQuery, params);
    const total = countResult[0].total;

    res.json({
      message: 'Lấy danh sách nhật ký thành công',
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        total_pages: Math.ceil(total / limit)
      },
      data: rows.map(r => ({
        diary_id: r.diary_id,
        hive_id: r.hive_id,
        hive_name: r.hive_name,
        location: r.location,
        check_date: r.check_date,
        status: r.status,
        weather: r.weather,
        temperature: r.temperature,
        humidity: r.humidity,
        actions: r.actions,
        notes: r.notes,
        created_at: r.created_at
      }))
    });
  } catch (err) {
    console.error('Get diary list error:', err);
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
});

// -------------------------
//// 3. Cập nhật nhật ký
// -------------------------
router.put('/update/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const allowedFields = [
      'check_date', 'status', 'weather', 'temperature',
      'humidity', 'actions', 'notes'
    ];

    const setClause = [];
    const values = [];

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        setClause.push(`${field} = ?`);
        values.push(updates[field]);
      }
    }

    if (setClause.length === 0) {
      return res.status(400).json({ message: 'Không có dữ liệu để cập nhật' });
    }

    values.push(id);

    const [result] = await pool.query(
      `UPDATE ${TABLE_NAME} SET ${setClause.join(', ')}, updated_at = NOW() WHERE diary_id = ?`,
      values
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Không tìm thấy nhật ký' });
    }

    res.json({ message: 'Cập nhật nhật ký thành công' });
  } catch (err) {
    console.error('Update diary error:', err);
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
});

// -------------------------
//// 4. Xóa nhật ký
// -------------------------
router.delete('/delete/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const [result] = await pool.query(`DELETE FROM ${TABLE_NAME} WHERE diary_id = ?`, [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Không tìm thấy nhật ký để xóa' });
    }

    res.json({ message: 'Xóa nhật ký thành công' });
  } catch (err) {
    console.error('Delete diary error:', err);
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
});

module.exports = router;