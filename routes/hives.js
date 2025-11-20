// routes/hives.js
const express = require("express");
const router = express.Router();
const { pool } = require("../config/db");
const auth = require("../middleware/auth");
const authorize = require("../middleware/authorize");
const QRCode = require("qrcode");
const { checkHiveAndNotify } = require("../utils/notificationService");

/* ===========================================================
   🐝 HIVE ROUTES – MySQL Version (Full CRUD + QR)
   =========================================================== */

/**
 * 📊 GET /api/hives/health-stats
 */
router.get(
  "/health-stats",
  auth,
  authorize("ADMIN", "KEEPER"),
  async (req, res) => {
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
      res
        .status(500)
        .json({ success: false, message: "Lỗi khi thống kê tổ ong" });
    }
  }
);

/**
 * 🐝 GET /api/hives (list)
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
    const [rows] = await conn.query(sqlData, [
      ...params,
      Number(limit),
      Number(offset),
    ]);
    const [count] = await conn.query(sqlCount, params);
    conn.release();

    res.json({
      success: true,
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
 * 🐝 GET /api/hives/:id (detail)
 */
router.get("/:id", auth, authorize("ADMIN", "KEEPER"), async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      "SELECT * FROM Hives WHERE hive_id = ? AND is_deleted = 0",
      [id]
    );

    if (rows.length === 0)
      return res.status(404).json({ message: "Không tìm thấy tổ ong" });

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error("❌ Lỗi GET /api/hives/:id:", err);
    res.status(500).json({ message: "Lỗi server", error: err.message });
  }
});

/**
 * 🐝 POST /api/hives (create)
 */
router.post("/", auth, authorize("ADMIN", "KEEPER"), async (req, res) => {
  try {
    const {
      hive_name,
      creation_date,
      hive_type,
      status,
      queen_count,
      frame_count,
      qr_code,
      queen_status,
      location,
      notes,
      farm_id,
    } = req.body;

    // Validate bắt buộc
    if (
      !hive_name ||
      !creation_date ||
      !hive_type ||
      !status ||
      !queen_status ||
      !location ||
      !farm_id
    )
      return res.status(400).json({ message: "Thiếu thông tin bắt buộc" });

    const [result] = await pool.query(
      `
      INSERT INTO Hives 
      (hive_name, creation_date, hive_type, status, queen_count, frame_count,
       qr_code, queen_status, location, notes, farm_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        hive_name,
        creation_date,
        hive_type,
        status,
        queen_count || 1,
        frame_count || 0,
        qr_code || null,
        queen_status,
        location,
        notes || null,
        farm_id,
      ]
    );

    res.status(201).json({ success: true, hive_id: result.insertId });
  } catch (err) {
    console.error("❌ Lỗi POST /api/hives:", err);
    res.status(500).json({ message: "Lỗi server", error: err.message });
  }
});

/**
 * 🐝 PUT /api/hives/:id (update)
 */
router.put("/:id", auth, authorize("ADMIN", "KEEPER"), async (req, res) => {
  try {
    const hiveId = req.params.id;

    const {
      hive_name,
      creation_date,
      hive_type,
      status,
      queen_count,
      frame_count,
      qr_code,
      queen_status,
      location,
      notes,
      farm_id,
    } = req.body;

    const [exists] = await pool.query(
      "SELECT hive_id FROM Hives WHERE hive_id=? AND is_deleted=0",
      [hiveId]
    );

    if (!exists.length)
      return res.status(404).json({ message: "Không tìm thấy tổ ong" });

    await pool.query(
      `
      UPDATE Hives SET 
        hive_name=?, creation_date=?, hive_type=?, status=?,
        queen_count=?, frame_count=?, qr_code=?, queen_status=?,
        location=?, notes=?, farm_id=?, updated_at=NOW()
      WHERE hive_id=?
      `,
      [
        hive_name,
        creation_date,
        hive_type,
        status,
        queen_count,
        frame_count,
        qr_code,
        queen_status,
        location,
        notes,
        farm_id,
        hiveId,
      ]
    );

    // ================================
    // 🔔 GỬI THÔNG BÁO SAU KHI CẬP NHẬT
    // ================================
    try {
      const [hiveRows] = await pool.query(
        "SELECT * FROM Hives WHERE hive_id = ? AND is_deleted = 0",
        [hiveId]
      );

      if (hiveRows.length) {
        const hive = hiveRows[0];
        await checkHiveAndNotify(hive);
      }
    } catch (notifyErr) {
      console.error(
        "❌ Lỗi gửi thông báo sau khi cập nhật tổ ong:",
        notifyErr
      );
    }
    // ================================

    res.json({ success: true, message: "Cập nhật tổ ong thành công" });
  } catch (err) {
    console.error("❌ Lỗi PUT /api/hives/:id:", err);
    res.status(500).json({ message: "Lỗi server", error: err.message });
  }
});

/**
 * 🐝 DELETE /api/hives/:id (soft delete)
 */
router.delete("/:id", auth, authorize("ADMIN", "KEEPER"), async (req, res) => {
  try {
    const hiveId = req.params.id;

    const [exists] = await pool.query(
      "SELECT hive_id FROM Hives WHERE hive_id=? AND is_deleted=0",
      [hiveId]
    );

    if (!exists.length)
      return res
        .status(404)
        .json({ message: "Tổ ong không tồn tại hoặc đã bị xóa" });

    await pool.query("UPDATE Hives SET is_deleted = 1 WHERE hive_id = ?", [
      hiveId,
    ]);

    res.json({ success: true, message: "Xóa tổ ong thành công" });
  } catch (err) {
    console.error("❌ Lỗi DELETE hive:", err);
    res.status(500).json({ message: "Lỗi server", error: err.message });
  }
});

/**
 * 🐝 POST /api/hives/:id/generate-qr
 */
router.post(
  "/:id/generate-qr",
  auth,
  authorize("ADMIN", "KEEPER"),
  async (req, res) => {
    try {
      const hiveId = req.params.id;

      const [check] = await pool.query(
        "SELECT hive_id, hive_name FROM Hives WHERE hive_id = ? AND is_deleted = 0",
        [hiveId]
      );

      if (check.length === 0)
        return res.status(404).json({ message: "Không tìm thấy tổ ong" });

      const hive = check[0];
      const qrContent = `HIVE_ID:${hive.hive_id};NAME:${hive.hive_name}`;
      const qrBase64 = await QRCode.toDataURL(qrContent);

      await pool.query(
        "UPDATE Hives SET qr_code = ?, updated_at = NOW() WHERE hive_id = ?",
        [qrBase64, hiveId]
      );

      res.json({
        success: true,
        hive_id: hive.hive_id,
        hive_name: hive.hive_name,
        qr_code: qrBase64,
      });
    } catch (err) {
      console.error("❌ Lỗi tạo QR:", err);
      res.status(500).json({ message: "Lỗi server", error: err.message });
    }
  }
);

/**
 * 🧩 GET /api/hives/:id/qr-image
 */
router.get(
  "/:id/qr-image",
  auth,
  authorize("ADMIN", "KEEPER"),
  async (req, res) => {
    try {
      const hiveId = req.params.id;

      const [rows] = await pool.query(
        "SELECT qr_code FROM Hives WHERE hive_id = ? AND is_deleted = 0",
        [hiveId]
      );

      if (rows.length === 0) return res.status(404).send("Không tìm thấy tổ ong");

      if (!rows[0].qr_code)
        return res.status(400).send("Tổ ong này chưa được tạo QR");

      const base64 = rows[0].qr_code.replace(/^data:image\/png;base64,/, "");
      const img = Buffer.from(base64, "base64");

      res.writeHead(200, {
        "Content-Type": "image/png",
        "Content-Length": img.length,
      });
      res.end(img);
    } catch (err) {
      console.error("❌ Lỗi khi lấy QR:", err);
      res.status(500).send("Server Error");
    }
  }
);

module.exports = router;
