const express = require("express");
const router = express.Router();
const { pool } = require("../config/db");
const auth = require("../middleware/auth");
const authorize = require("../middleware/authorize");
const QRCode = require("qrcode");

/* ===========================================================
   🐝 HIVE ROUTES (MySQL version)
   Tables: Hives
   =========================================================== */

/**
 * 📊 GET /api/hives/health-stats
 */
router.get("/health-stats", auth, authorize("ADMIN", "KEEPER"), async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        SUM(CASE WHEN status = 'HEALTHY' THEN 1 ELSE 0 END) AS HEALTHY,
        SUM(CASE WHEN status = 'WEAK' THEN 1 ELSE 0 END) AS WEAK,
        SUM(CASE WHEN status = 'NEED_CHECK' THEN 1 ELSE 0 END) AS NEED_CHECK,
        SUM(CASE WHEN status = 'ALERT' THEN 1 ELSE 0 END) AS ALERT
      FROM Hives
      WHERE is_deleted = 0
    `);

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error("❌ Lỗi thống kê:", err);
    res.status(500).json({ success: false, message: "Lỗi khi thống kê tổ ong" });
  }
});


/**
 * 🐝 GET /api/hives
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
      SELECT * FROM Hives
      ${where}
      ORDER BY hive_id DESC
      LIMIT ? OFFSET ?`;

    const sqlCount = `SELECT COUNT(*) AS total FROM Hives ${where}`;

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
 */
router.get("/:id", auth, authorize("ADMIN", "KEEPER"), async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query("SELECT * FROM Hives WHERE hive_id = ? AND is_deleted = 0", [id]);

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
 */
router.post("/", auth, authorize("ADMIN", "KEEPER"), async (req, res) => {
  try {
    const {
      hive_name, creation_date, hive_type, status, frame_count,
      qr_code = null, queen_count, queen_status, location, notes = null
    } = req.body;

    if (!hive_name || !creation_date || !hive_type || !status || !queen_status || !location)
      return res.status(400).json({ message: "Thiếu thông tin bắt buộc" });

    const [result] = await pool.query(`
      INSERT INTO Hives (hive_name, creation_date, hive_type, status, frame_count, qr_code,
                         queen_count, queen_status, location, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      hive_name, creation_date, hive_type, status, frame_count,
      qr_code, queen_count, queen_status, location, notes
    ]);

    res.status(201).json({ message: "Thêm tổ ong thành công", hive_id: result.insertId });
  } catch (err) {
    console.error("❌ Lỗi POST /api/hives:", err);
    res.status(500).json({ message: "Lỗi server", error: err.message });
  }
});

/**
 * 🐝 PUT /api/hives/:id
 */
router.put("/:id", auth, authorize("ADMIN", "KEEPER"), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      hive_name, creation_date, hive_type, status, frame_count,
      qr_code, queen_count, queen_status, location, notes
    } = req.body;

    const [check] = await pool.query("SELECT * FROM Hives WHERE hive_id = ? AND is_deleted = 0", [id]);

    if (check.length === 0)
      return res.status(404).json({ message: "Không tìm thấy tổ ong để cập nhật" });

    await pool.query(`
      UPDATE Hives SET hive_name=?, creation_date=?, hive_type=?, status=?,
      frame_count=?, qr_code=?, queen_count=?, queen_status=?, location=?, notes=?,
      updated_at = NOW()
      WHERE hive_id=? AND is_deleted=0
    `, [
      hive_name, creation_date, hive_type, status, frame_count,
      qr_code, queen_count, queen_status, location, notes, id
    ]);

    res.json({ message: "Cập nhật tổ ong thành công" });
  } catch (err) {
    console.error("❌ Lỗi PUT /api/hives/:id:", err);
    res.status(500).json({ message: "Lỗi server", error: err.message });
  }
});

/**
 * 🐝 DELETE /api/hives/:id
 */
router.delete("/:id", auth, authorize("ADMIN", "KEEPER"), async (req, res) => {
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

/**
 * 🐝 ✅ POST /api/hives/:id/generate-qr (NEW)
 */
router.post("/:id/generate-qr", auth, authorize("ADMIN", "KEEPER"), async (req, res) => {
  try {
    const { id } = req.params;

    const [check] = await pool.query(
      "SELECT hive_id, hive_name FROM Hives WHERE hive_id = ? AND is_deleted = 0",
      [id]
    );

    if (check.length === 0)
      return res.status(404).json({ message: "Không tìm thấy tổ ong" });

    const hive = check[0];
    const qrContent = `HIVE_ID:${hive.hive_id};NAME:${hive.hive_name}`;

    const qrBase64 = await QRCode.toDataURL(qrContent);

    await pool.query(
      "UPDATE Hives SET qr_code = ?, updated_at = NOW() WHERE hive_id = ?",
      [qrBase64, id]
    );

    res.json({
      message: "Tạo QR thành công",
      hive_id: hive.hive_id,
      hive_name: hive.hive_name,
      qr_code: qrBase64
    });
  } catch (err) {
    console.error("❌ Lỗi tạo QR:", err);
    res.status(500).json({ message: "Lỗi server", error: err.message });
  }
});

// 🧩 Xem ảnh QR trực tiếp trên trình duyệt (có xác thực)
router.get("/:id/qr-image", auth, authorize("ADMIN", "KEEPER"), async (req, res) => {
  try {
    const { id } = req.params;

    // Lấy QR code từ DB
    const [rows] = await pool.query(
      "SELECT qr_code FROM Hives WHERE hive_id = ? AND is_deleted = 0",
      [id]
    );

    if (rows.length === 0)
      return res.status(404).send("Không tìm thấy tổ ong");

    // Nếu tổ ong chưa có QR
    if (!rows[0].qr_code)
      return res.status(400).send("Tổ ong này chưa được tạo mã QR");

    // Tách phần base64 ra khỏi prefix "data:image/png;base64,"
    const base64Data = rows[0].qr_code.replace(/^data:image\/png;base64,/, "");

    // Chuyển base64 sang buffer (ảnh thực)
    const img = Buffer.from(base64Data, "base64");

    // Trả ảnh ra cho trình duyệt hiển thị
    res.writeHead(200, {
      "Content-Type": "image/png",
      "Content-Length": img.length
    });
    res.end(img);

  } catch (err) {
    console.error("❌ Lỗi khi lấy QR:", err);
    res.status(500).send("Server Error");
  }
});



module.exports = router;
