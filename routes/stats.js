// routes/stats.js
const router = require('express').Router();
const { pool } = require('../config/db');
const auth = require('../middleware/auth');

// Helper phân quyền
const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ message: 'Không có quyền truy cập' });
  }
  next();
};

// 1) Tổng số người nuôi ong (ADMIN only)
router.get('/beekeepers-count', auth, authorize('ADMIN'), async (_req, res) => {
  try {
    const [r] = await pool.query(
      "SELECT COUNT(*) AS total_beekeepers FROM Users WHERE role = 'KEEPER'"
    );
    res.json(r[0]);
  } catch (err) {
    console.error('beekeepers-count:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// 2) Tổng số trại, tổ, tổng sản lượng
router.get('/summary', auth, async (req, res) => {
  try {
    let whereFarm = '';
    const params = [];

    // Nếu KEEPER: chỉ tính farm do mình quản lý
    if (req.user.role === 'KEEPER') {
      whereFarm = 'WHERE f.manager_id = ?';
      params.push(req.user.user_id);
    }

    const [r] = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM Farms f ${whereFarm}) AS total_farms,
         (SELECT COUNT(*) FROM Hives h
          JOIN Farms f ON h.farm_id = f.farm_id
          ${whereFarm.replace('f.', 'f1.')}) AS total_hives,
         (SELECT COALESCE(SUM(p.honey_amount_kg),0)
          FROM Hives h
          JOIN Production p ON p.hive_id = h.hive_id
          JOIN Farms f ON h.farm_id = f.farm_id
          ${whereFarm.replace('f.', 'f2.')}) AS total_honey_kg`,
      [...params, ...params, ...params] // lặp 3 lần vì 3 subquery
    );

    res.json(r[0]);
  } catch (err) {
    console.error('summary:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// 3) Biểu đồ sản lượng theo tháng
router.get('/monthly-production', auth, async (req, res) => {
  try {
    const year = Number(req.query.year) || new Date().getFullYear();
    let whereHive = '';
    const params = [year];

    if (req.user.role === 'KEEPER') {
      whereHive = 'AND f.manager_id = ?';
      params.push(req.user.user_id);
    }

    const [rows] = await pool.query(
      `SELECT MONTH(p.harvest_date) AS month, ROUND(SUM(p.honey_amount_kg),2) AS total_kg
       FROM Hives h
       JOIN Production p ON p.hive_id = h.hive_id
       JOIN Farms f ON h.farm_id = f.farm_id
       WHERE YEAR(p.harvest_date) = ? ${whereHive}
       GROUP BY MONTH(p.harvest_date)
       ORDER BY month`,
      params
    );

    res.json({ year, data: rows });
  } catch (err) {
    console.error('monthly-production:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// 4) Sức khỏe tổ ong
router.get('/hive-health', auth, async (req, res) => {
  try {
    let whereHive = '';
    const params = [];

    if (req.user.role === 'KEEPER') {
      whereHive = 'WHERE f.manager_id = ?';
      params.push(req.user.user_id);
    }

    const [rows] = await pool.query(
      `SELECT h.status AS tinh_trang, COUNT(*) AS so_luong
       FROM Hives h
       JOIN Farms f ON h.farm_id = f.farm_id
       ${whereHive}
       GROUP BY h.status`,
      params
    );

    res.json(rows);
  } catch (err) {
    console.error('hive-health:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// 5) Top trại theo sản lượng (limit, year)
router.get('/top-farms', auth, async (req, res) => {
  try {
    const year = Number(req.query.year) || new Date().getFullYear();
    const limit = Math.min(Math.max(Number(req.query.limit) || 5, 1), 50);
    let whereFarm = '';
    const params = [year];

    if (req.user.role === 'KEEPER') {
      whereFarm = 'AND f.manager_id = ?';
      params.push(req.user.user_id);
    }

    const [rows] = await pool.query(
      `SELECT f.farm_id, f.farm_name, ROUND(SUM(p.honey_amount_kg),2) AS total_kg
       FROM Farms f
       JOIN Hives h ON h.farm_id = f.farm_id
       JOIN Production p ON p.hive_id = h.hive_id
       WHERE YEAR(p.harvest_date) = ? ${whereFarm}
       GROUP BY f.farm_id, f.farm_name
       ORDER BY total_kg DESC
       LIMIT ?`,
      [...params, limit]
    );

    res.json({ year, limit, data: rows });
  } catch (err) {
    console.error('top-farms:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
