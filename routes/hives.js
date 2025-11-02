// routes/hives.js
const express = require('express');
const router = express.Router();
const { poolPromise, sql } = require('../config/db');
const auth = require('../middleware/auth');

// GET /api/hives?status=Khỏe mạnh&search=A&page=1&limit=10
router.get('/', auth, async (req, res) => {
  const { status, search, page = 1, limit = 20 } = req.query;
  const offset = (Number(page) - 1) * Number(limit);

  let where = 'WHERE is_deleted = 0';
  if (status) where += ' AND status=@status';
  if (search) where += ' AND (hive_name LIKE @kw OR location LIKE @kw)';

  const pool = await poolPromise;
  const r = pool.request();
  if (status) r.input('status', sql.NVarChar, status);
  if (search) r.input('kw', sql.NVarChar, `%${search}%`);

  const q = `
    SELECT hive_id, hive_name, location, status, created_at, user_id
    FROM dbo.Hives
    ${where}
    ORDER BY hive_id DESC
    OFFSET ${offset} ROWS FETCH NEXT ${Number(limit)} ROWS ONLY;

    SELECT COUNT(1) AS total FROM dbo.Hives ${where};
  `;

  const rs = await r.query(q);
  res.json({
    data: rs.recordsets[0],
    total: rs.recordsets[1][0].total,
    page: Number(page),
    limit: Number(limit)
  });
});

// 🟢 Lấy tất cả tổ ong
router.get('/', auth, async (req, res) => {
  const { status, search } = req.query;

  let where = 'WHERE is_deleted = 0';
  if (status) where += ' AND status=@status';
  if (search) where += ' AND (hive_name LIKE @kw OR location LIKE @kw)';

  try {
    const pool = await poolPromise;
    const r = pool.request();
    if (status) r.input('status', sql.NVarChar, status);
    if (search) r.input('kw', sql.NVarChar, `%${search}%`);

    const rs = await r.query(`
      SELECT hive_id, hive_name, location, status, created_at, user_id
      FROM dbo.Hives
      ${where}
      ORDER BY hive_id DESC
    `);

    res.json({ total: rs.recordset.length, data: rs.recordset });
  } catch (err) {
    console.error('Lỗi GET /api/hives:', err);
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
});

// DELETE /api/hives/:id — Xóa mềm
router.delete('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await poolPromise;
    const request = pool.request();
    request.input('id', sql.Int, id);

    const check = await request.query('SELECT * FROM dbo.Hives WHERE hive_id=@id AND is_deleted=0');
    if (check.recordset.length === 0)
      return res.status(404).json({ message: 'Tổ ong không tồn tại hoặc đã bị xóa' });

    await request.query(`
      UPDATE dbo.Hives
      SET is_deleted = 1, created_at = created_at -- giữ timestamp cũ
      WHERE hive_id = @id;
    `);

    res.json({ message: 'Xóa tổ ong thành công' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
});

module.exports = router;
