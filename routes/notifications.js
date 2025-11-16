const router = require("express").Router();
const { pool } = require("../config/db");
const auth = require("../middleware/auth");


// ======================================
// 1. GET LIST NOTIFICATIONS (paging)
// ======================================
router.get("/", auth, async (req, res) => {
  try {
    const userId = req.user.user_id;

    // Validate page + page_size
    let page = parseInt(req.query.page);
    if (isNaN(page) || page < 1) page = 1;

    let pageSize = parseInt(req.query.page_size);
    if (isNaN(pageSize) || pageSize < 1) pageSize = 20;
    if (pageSize > 100) pageSize = 100;

    const offset = (page - 1) * pageSize;

    console.log("NOTI QUERY:", { userId, offset, pageSize });

    // MySQL không hỗ trợ LIMIT ?,?
    const sql = `
      SELECT n.*, h.hive_name
      FROM Notifications n
      LEFT JOIN Hives h ON n.hive_id = h.hive_id
      WHERE n.user_id = ?
      ORDER BY n.created_at DESC
      LIMIT ${offset}, ${pageSize}
    `;

    const [rows] = await pool.execute(sql, [userId]);

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("NOTI GET ERROR:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});


// ======================================
// 2. GET NOTIFICATION DETAIL
// ======================================
router.get("/:id", auth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const userId = req.user.user_id;

    const [rows] = await pool.execute(
      `SELECT n.*, h.hive_name
       FROM Notifications n
       LEFT JOIN Hives h ON n.hive_id = h.hive_id
       WHERE n.notification_id = ? AND n.user_id = ?
       LIMIT 1`,
      [id, userId]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: "Không tìm thấy thông báo" });
    }

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error("NOTI DETAIL ERROR:", err);
    res.status(500).json({ success: false });
  }
});


// ======================================
// 3. MARK ONE NOTIFICATION AS READ
// ======================================
router.patch("/:id/read", auth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const userId = req.user.user_id;

    const [check] = await pool.execute(
      `SELECT notification_id 
       FROM Notifications 
       WHERE notification_id = ? AND user_id = ?
       LIMIT 1`,
      [id, userId]
    );

    if (check.length === 0) {
      return res.status(403).json({
        success: false,
        message: "Không có quyền đánh dấu thông báo này"
      });
    }

    await pool.execute(
      `UPDATE Notifications SET is_read = 1 WHERE notification_id = ?`,
      [id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("NOTI READ ERROR:", err);
    res.status(500).json({ success: false });
  }
});


// ======================================
// 4. MARK ALL AS READ
// ======================================
router.patch("/read_all/all", auth, async (req, res) => {
  try {
    const userId = req.user.user_id;

    await pool.execute(
      `UPDATE Notifications 
       SET is_read = 1 
       WHERE user_id = ?`,
      [userId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("NOTI READ ALL ERROR:", err);
    res.status(500).json({ success: false });
  }
});


// ======================================
// 5. GET UNREAD COUNT
// ======================================
router.get("/unread/count", auth, async (req, res) => {
  try {
    const userId = req.user.user_id;

    const [rows] = await pool.execute(
      `SELECT COUNT(*) AS unread
       FROM Notifications
       WHERE user_id = ? AND is_read = 0`,
      [userId]
    );

    res.json({ success: true, unread: rows[0].unread });
  } catch (err) {
    console.error("NOTI COUNT ERROR:", err);
    res.status(500).json({ success: false });
  }
});

// ======================================
// 6. DELETE ONE NOTIFICATION
// ======================================
router.delete("/:id", auth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const userId = req.user.user_id;

    const [result] = await pool.execute(
      `DELETE FROM Notifications 
       WHERE notification_id = ? AND user_id = ?`,
      [id, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy thông báo hoặc không có quyền xoá"
      });
    }

    res.json({ success: true, message: "Đã xoá thông báo" });
  } catch (err) {
    console.error("NOTI DELETE ERROR:", err);
    res.status(500).json({ success: false });
  }
});

// ======================================
// 7. DELETE ALL READ NOTIFICATIONS
// ======================================
router.delete("/clear/read", auth, async (req, res) => {
  try {
    const userId = req.user.user_id;

    const [result] = await pool.execute(
      `DELETE FROM Notifications
       WHERE user_id = ? AND is_read = 1`,
      [userId]
    );

    res.json({
      success: true,
      deleted: result.affectedRows,
      message: "Đã xoá tất cả thông báo đã đọc"
    });
  } catch (err) {
    console.error("NOTI DELETE ALL READ ERROR:", err);
    res.status(500).json({ success: false });
  }
});

module.exports = router;
