// routes/disease.routes.js
const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { verifyAccessToken } = require('../utils/jwt');

// -------------------------
//// Middleware: Kiểm tra token
// -------------------------
const auth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer '))
    return res.status(401).json({ message: 'Thiếu token' });

  const token = authHeader.split(' ')[1];
  try {
    req.user = verifyAccessToken(token);
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Token không hợp lệ hoặc hết hạn' });
  }
};

// -------------------------
//// 1. Thêm bệnh mới
// -------------------------
router.post('/add', auth, async (req, res) => {
  try {
    const { name, scientific_name, description, symptoms, treatment } = req.body;
    if (!name)
      return res.status(400).json({ message: 'Thiếu tên bệnh' });

    // Đã thống nhất dùng Diseases (D hoa)
    const [exist] = await pool.query('SELECT disease_id FROM Diseases WHERE name = ?', [name]);
    if (exist.length > 0)
      return res.status(409).json({ message: 'Bệnh đã tồn tại' });

    const [result] = await pool.query(
      `INSERT INTO Diseases 
         (name, scientific_name, description, symptoms, treatment, created_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [name, scientific_name || null, description || null, symptoms || null, treatment || null]
    );

    res.status(201).json({
      message: 'Thêm bệnh thành công',
      disease_id: result.insertId,
    });
  } catch (err) {
    console.error('Add disease error:', err);
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
});

// -------------------------
//// 2. Ghi nhận bệnh ở tổ ong
// -------------------------
router.post('/record', auth, async (req, res) => {
  try {
    const { hive_id, disease_id, detected_date, severity, notes } = req.body;
    if (!hive_id || !disease_id)
      return res.status(400).json({ message: 'Thiếu hive_id hoặc disease_id' });

    const [hive] = await pool.query('SELECT hive_id FROM Hives WHERE hive_id = ?', [hive_id]);
    const [disease] = await pool.query('SELECT disease_id FROM Diseases WHERE disease_id = ?', [disease_id]);

    if (hive.length === 0) return res.status(404).json({ message: 'Không tìm thấy tổ ong' });
    if (disease.length === 0) return res.status(404).json({ message: 'Không tìm thấy bệnh' });

    await pool.query(
      `INSERT INTO Hive_Diseases 
         (hive_id, disease_id, detected_date, severity, notes, recorded_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [hive_id, disease_id, detected_date || null, severity || 'medium', notes || null]
    );

    res.status(201).json({ message: 'Ghi nhận bệnh thành công' });
  } catch (err) {
    console.error('Record disease error:', err);
    res.copy.status(500).json({ message: 'Lỗi server', error: err.message });
  }
});

// -------------------------
//// 3. Thống kê tỷ lệ bệnh
// -------------------------
router.get('/stats', auth, async (req, res) => {
  try {
    const { farm_id, start_date, end_date } = req.query;

    let where = '';
    const params = [];

    if (farm_id) {
      where += ' AND h.farm_id = ?';
      params.push(farm_id);
    }
    if (start_date) {
      where += ' AND hd.detected_date >= ?';
      params.push(start_date);
    }
    if (end_date) {
      where += ' AND hd.detected_date <= ?';
      params.push(end_date);
    }

    const query = `
      SELECT 
        d.disease_id,
        d.name,
        COUNT(DISTINCT hd.hive_id) AS infected_hives,
        COUNT(DISTINCT h.hive_id) AS total_hives,
        ROUND(
          COUNT(DISTINCT hd.hive_id) * 100.0 / NULLIF(COUNT(DISTINCT h.hive_id), 0),
          2
        ) AS infection_rate_percent
      FROM Diseases d
      LEFT JOIN Hive_Diseases hd ON d.disease_id = hd.disease_id
      LEFT JOIN Hives h ON hd.hive_id = h.hive_id ${where}
      GROUP BY d.disease_id, d.name
      ORDER BY infection_rate_percent DESC
    `;

    const [rows] = await pool.query(query, params);

    res.json({
      message: rows.length === 0 ? 'Chưa có dữ liệu bệnh' : 'Thống kê thành công',
      period: { start_date, end_date },
      stats: rows.map(r => ({
        disease_id: r.disease_id,
        name: r.name,
        infected_hives: Number(r.infected_hives) || 0,
        total_hives: Number(r.total_hives) || 0,
        infection_rate_percent: Number(r.infection_rate_percent) || 0,
      })),
    });
  } catch (err) {
    console.error('Disease stats error:', err);
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
});

module.exports = router;