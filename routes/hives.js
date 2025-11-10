// routes/hives.js ✅ FULL MySQL Version (BeeNote)
const express = require("express");
const router = express.Router();
const { pool } = require("../config/db");
const auth = require("../middleware/auth");
const authorize = require("../middleware/authorize");

/* ===========================================================
   🐝 HIVE ROUTES (MySQL version)
   Tables: Hives
   =========================================================== */

/**
 * 📊 GET /api/hives/health-stats
 * Thống kê tổ khỏe / yếu (ADMIN + KEEPER)
 */
router.get("/health-stats", auth, authorize("ADMIN", "KEEPER"), async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        SUM(CASE WHEN status = 'KHOE'         THEN 1 ELSE 0 END) AS KHOE,
        SUM(CASE WHEN status = 'YEU'          THEN 1 ELSE 0 END) AS YEU,
        SUM(CASE WHEN status = 'CAN_KIEM_TRA' THEN 1 ELSE 0 END) AS CAN_KIEM_TRA,
        SUM(CASE WHEN status = 'CANH_BAO'     THEN 1 ELSE 0 END) AS CANH_BAO
      FROM Hives
      WHERE is_deleted = 0
    `);

    const r = rows[0] || {};
    const stats = {
      KHOE: Number(r.KHOE || 0),
      YEU: Number(r.YEU || 0),
      CAN_KIEM_TRA: Number(r.CAN_KIEM_TRA || 0),
      CANH_BAO: Number(r.CANH_BAO || 0),
    };

    res.json({ success: true, data: stats });
  } catch (err) {
    console.error("❌ Lỗi thống kê sức khỏe tổ ong:", err);
    res.status(500).json({ success: false, message: "Lỗi khi thống kê tổ ong" });
  }
});


/**
 * 🐝 GET /api/hives
 * Lấy danh sách tổ ong (ADMIN + KEEPER)
 * Query: ?status=ACTIVE&search=A&page=1&limit=10
 */
router.get("/", auth, authorize("ADMIN", "KEEPER"), async (req, res) => {
  try {
    const { status, search, page = 1, limit = 10 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let where = "WHERE is_deleted = 0";
    const params = [];

    if (status) {
      where += " AND status = ?";
      params.push(status);
    }

    if (search) {
      where += " AND (hive_name LIKE ? OR location LIKE ?)";
      params.push(`%${search}%`, `%${search}%`);
    }

    const sqlData = `
      SELECT hive_id, hive_name, creation_date, hive_type, status,
             frame_count, qr_code,
             queen_count, queen_status, location, notes,
             created_at, updated_at
      FROM Hives
      ${where}
      ORDER BY hive_id DESC
      LIMIT ? OFFSET ?;
    `;
    const sqlCount = `SELECT COUNT(*) AS total FROM Hives ${where};`;

    const conn = await pool.getConnection();
    const [rows] = await conn.query(sqlData, [...params, Number(limit), Number(offset)]);
    const [count] = await conn.query(sqlCount, params);
    conn.release();

    res.json({
      total: count[0].total,
      page: Number(page),
      limit: Number(limit),
      data: rows,
    });
  } catch (err) {
    console.error("❌ Lỗi GET /api/hives:", err);
    res.status(500).json({ message: "Lỗi server", error: err.message });
  }
});

/**
 * 🐝 GET /api/hives/:id
 * Lấy chi tiết tổ ong (ADMIN + KEEPER)
 */
router.get("/:id", auth, authorize("ADMIN", "KEEPER"), async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      `SELECT * FROM Hives WHERE hive_id = ? AND is_deleted = 0`,
      [id]
    );

    if (rows.length === 0)
      return res.status(404).json({ message: "Không tìm thấy tổ ong" });

    res.json(rows[0]);
  } catch (err) {
    console.error("❌ Lỗi GET /api/hives/:id:", err);
    res.status(500).json({ message: "Lỗi server", error: err.message });
  }
});

/**
 * 🐝 POST /api/hives
 * Thêm tổ ong mới (ADMIN + KEEPER)
 */
router.post("/", auth, authorize("ADMIN", "KEEPER"), async (req, res) => {
  try {
    const {
      hive_name,
      creation_date,
      hive_type,
      status,
      frame_count = 0,
      qr_code = null,
      queen_count = 1,
      queen_status,
      location,
      notes = null,
    } = req.body;

    if (!hive_name || !creation_date || !hive_type || !status || !queen_status || !location)
      return res.status(400).json({ message: "Thiếu thông tin bắt buộc" });

    const [result] = await pool.query(
      `
      INSERT INTO Hives 
      (hive_name, creation_date, hive_type, status, frame_count, qr_code, queen_count, queen_status, location, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [hive_name, creation_date, hive_type, status, frame_count, qr_code, queen_count, queen_status, location, notes]
    );

    res.status(201).json({
      message: "Thêm tổ ong thành công",
      hive_id: result.insertId,
    });
  } catch (err) {
    console.error("❌ Lỗi POST /api/hives:", err);
    res.status(500).json({ message: "Lỗi server", error: err.message });
  }
});

/**
 * 🐝 PUT /api/hives/:id
 * Cập nhật thông tin tổ ong (CHỈ ADMIN)
 */
router.put("/:id", auth, authorize("ADMIN"), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      hive_name,
      creation_date,
      hive_type,
      status,
      frame_count,
      qr_code,
      queen_count,
      queen_status,
      location,
      notes,
    } = req.body;

    const [check] = await pool.query("SELECT * FROM Hives WHERE hive_id = ? AND is_deleted = 0", [id]);
    if (check.length === 0)
      return res.status(404).json({ message: "Không tìm thấy tổ ong để cập nhật" });

    await pool.query(
      `
      UPDATE Hives
      SET hive_name=?, creation_date=?, hive_type=?, status=?, 
          frame_count=?, qr_code=?, 
          queen_count=?, queen_status=?, location=?, notes=?, 
          updated_at = NOW()
      WHERE hive_id=? AND is_deleted=0
      `,
      [hive_name, creation_date, hive_type, status, frame_count, qr_code, queen_count, queen_status, location, notes, id]
    );

    res.json({ message: "Cập nhật tổ ong thành công" });
  } catch (err) {
    console.error("❌ Lỗi PUT /api/hives/:id:", err);
    res.status(500).json({ message: "Lỗi server", error: err.message });
  }
});

/**
 * 🐝 DELETE /api/hives/:id
 * Xóa mềm tổ ong (CHỈ ADMIN)
 */
router.delete("/:id", auth, authorize("ADMIN"), async (req, res) => {
  try {
    const { id } = req.params;

    const [check] = await pool.query("SELECT * FROM Hives WHERE hive_id=? AND is_deleted=0", [id]);
    if (check.length === 0)
      return res.status(404).json({ message: "Tổ ong không tồn tại hoặc đã bị xóa" });

    await pool.query("UPDATE Hives SET is_deleted = 1 WHERE hive_id = ?", [id]);
    res.json({ message: "Xóa tổ ong thành công" });
  } catch (err) {
    console.error("❌ Lỗi DELETE /api/hives/:id:", err);
    res.status(500).json({ message: "Lỗi server", error: err.message });
  }
});

module.exports = router;
