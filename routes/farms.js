// routes/farms.js
const router = require('express').Router();
const { pool } = require('../config/db');
const auth = require('../middleware/auth');

// --------- Helper phân quyền ----------
const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ message: 'Không có quyền truy cập' });
  }
  next();
};

// --------- List farms + filter + paginate ----------
router.get('/', auth, async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(req.query.page_size) || 20, 1), 100);
    const offset = (page - 1) * pageSize;

    let where = '';
    const params = [];

    // Nếu KEEPER, chỉ thấy farm mình quản lý (dựa vào user_id = manager_id)
    if (req.user.role === 'KEEPER') {
      where = 'WHERE f.manager_id = ?';
      params.push(req.user.user_id);
    }

    const [cnt] = await pool.query(`SELECT COUNT(*) AS total FROM Farms f ${where}`, params);

    const [rows] = await pool.query(
      `SELECT
         f.farm_id, f.farm_name, f.lat, f.lng, f.address, f.manager_id,
         u.full_name AS manager_name,
         (SELECT COUNT(*) FROM Hives h WHERE h.farm_id = f.farm_id) AS hive_count,
         (SELECT COALESCE(SUM(p.honey_amount_kg),0)
            FROM Hives h
            JOIN Production p ON p.hive_id = h.hive_id
           WHERE h.farm_id = f.farm_id) AS total_honey_kg
       FROM Farms f
       JOIN Users u ON u.user_id = f.manager_id
       ${where}
       ORDER BY f.created_at DESC
       LIMIT ?, ?`,
      [...params, offset, pageSize]
    );

    res.json({ data: rows, pagination: { page, page_size: pageSize, total: cnt[0].total } });
  } catch (e) {
    console.error('GET /farms', e);
    res.status(500).json({ message: 'Server error' });
  }
});

// --------- Farm detail ----------
router.get('/:id', auth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT f.*, u.full_name AS manager_name, u.email AS manager_email, u.phone AS manager_phone
       FROM Farms f
       JOIN Users u ON u.user_id = f.manager_id
       WHERE f.farm_id = ?`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Not found' });

    // KEEPER chỉ xem farm của mình
    if (req.user.role === 'KEEPER' && rows[0].manager_id !== req.user.user_id) {
      return res.status(403).json({ message: 'Không có quyền xem farm này' });
    }

    res.json(rows[0]);
  } catch (e) {
    console.error('GET /farms/:id', e);
    res.status(500).json({ message: 'Server error' });
  }
});

// --------- Hives of a farm ----------
router.get('/:id/hives', auth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT hive_id, hive_name, status
       FROM Hives
       WHERE farm_id = ?
       ORDER BY hive_id DESC`,
      [req.params.id]
    );

    // Nếu KEEPER, check quyền xem
    if (req.user.role === 'KEEPER') {
      const [farm] = await pool.query(`SELECT manager_id FROM Farms WHERE farm_id = ?`, [req.params.id]);
      if (!farm.length || farm[0].manager_id !== req.user.user_id) {
        return res.status(403).json({ message: 'Không có quyền xem hives này' });
      }
    }

    res.json(rows);
  } catch (e) {
    console.error('GET /farms/:id/hives', e);
    res.status(500).json({ message: 'Server error' });
  }
});

// --------- Monthly production of a farm ----------
router.get('/:id/monthly-production', auth, async (req, res) => {
  try {
    const year = Number(req.query.year) || new Date().getFullYear();

    // Nếu KEEPER, kiểm tra quyền
    if (req.user.role === 'KEEPER') {
      const [farm] = await pool.query(`SELECT manager_id FROM Farms WHERE farm_id = ?`, [req.params.id]);
      if (!farm.length || farm[0].manager_id !== req.user.user_id) {
        return res.status(403).json({ message: 'Không có quyền xem production này' });
      }
    }

    const [rows] = await pool.query(
      `SELECT MONTH(p.harvest_date) AS month, ROUND(SUM(p.honey_amount_kg),2) AS total_kg
       FROM Hives h
       JOIN Production p ON p.hive_id = h.hive_id
       WHERE h.farm_id = ? AND YEAR(p.harvest_date) = ?
       GROUP BY MONTH(p.harvest_date)
       ORDER BY month`,
      [req.params.id, year]
    );
    res.json({ year, data: rows });
  } catch (e) {
    console.error('GET /farms/:id/monthly-production', e);
    res.status(500).json({ message: 'Server error' });
  }
});

// --------- Create farm (ADMIN only) ----------
router.post('/', auth, authorize('ADMIN'), async (req, res) => {
  try {
    const { farm_name, manager_id, lat, lng, address } = req.body;
    if (!farm_name || !manager_id)
      return res.status(400).json({ message: 'farm_name & manager_id required' });

    const [r] = await pool.query(
      `INSERT INTO Farms (farm_name, manager_id, lat, lng, address) VALUES (?,?,?,?,?)`,
      [farm_name, manager_id, lat ?? null, lng ?? null, address ?? null]
    );
    res.status(201).json({ farm_id: r.insertId });
  } catch (e) {
    console.error('POST /farms', e);
    res.status(400).json({ message: e.code || 'INSERT_ERROR', detail: e.sqlMessage });
  }
});

// --------- Update farm (ADMIN only) ----------
router.put('/:id', auth, authorize('ADMIN'), async (req, res) => {
  try {
    const fields = ['farm_name','manager_id','lat','lng','address'];
    const data = Object.fromEntries(Object.entries(req.body).filter(([k]) => fields.includes(k)));
    const sets = [], params = [];
    for (const [k, v] of Object.entries(data)) { sets.push(`${k} = ?`); params.push(v); }
    if (!sets.length) return res.json({ success: true });
    params.push(req.params.id);

    const [r] = await pool.query(`UPDATE Farms SET ${sets.join(', ')} WHERE farm_id = ?`, params);
    if (!r.affectedRows) return res.status(404).json({ message: 'Not found' });
    res.json({ success: true });
  } catch (e) {
    console.error('PUT /farms/:id', e);
    res.status(400).json({ message: e.code || 'UPDATE_ERROR', detail: e.sqlMessage });
  }
});

// --------- Delete farm (ADMIN only) ----------
router.delete('/:id', auth, authorize('ADMIN'), async (req, res) => {
  try {
    const [r1] = await pool.query(`SELECT COUNT(*) AS c FROM Hives WHERE farm_id = ?`, [req.params.id]);
    if (r1[0].c > 0)
      return res.status(409).json({ message: 'Farm has hives. Reassign or delete hives first.' });

    const [r] = await pool.query(`DELETE FROM Farms WHERE farm_id = ?`, [req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ message: 'Not found' });
    res.json({ success: true });
  } catch (e) {
    console.error('DELETE /farms/:id', e);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
