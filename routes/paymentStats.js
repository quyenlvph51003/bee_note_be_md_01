const express = require("express");
const router = express.Router();
const { pool } = require("../config/db");

const auth = require("../middleware/auth");
const authorize = require("../middleware/authorize");

// =====================================================
// CHỈ ADMIN
// =====================================================
router.use(auth, authorize("admin"));

// =====================================================
// 1. DANH SÁCH 50 GIAO DỊCH VNPAY GẦN NHẤT (giữ nguyên)
// =====================================================
router.get("/transactions", async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        t.id,
        t.order_id,
        t.amount,
        t.type,
        t.bank_code,
        t.status,
        t.created_at,
        u.username
      FROM vnpay_transactions t
      LEFT JOIN Users u ON t.user_id = u.user_id
      ORDER BY t.created_at DESC
      LIMIT 50
    `);

    res.json({ status: true, data: rows });
  } catch (err) {
    console.error("TRANSACTION ERROR:", err.message);
    res.status(500).json({
      status: false,
      message: "Lỗi khi lấy danh sách giao dịch",
    });
  }
});

// =====================================================
// 2. TỔNG QUAN ĐƠN GIẢN
// GET /admin/vnpay/summary
// =====================================================
router.get("/summary", async (req, res) => {
  try {
    // 2.1. Tổng tiền, tổng đơn, tổng theo type (chỉ success)
    const [summaryRows] = await pool.query(`
      SELECT
        -- tổng số giao dịch thanh toán thành công
        COUNT(*) AS total_transactions,

        -- tổng tiền tất cả type
        IFNULL(SUM(amount), 0) AS total_amount,

        -- tổng tiền theo type
        IFNULL(SUM(CASE WHEN type = 'pro_monthly' THEN amount ELSE 0 END), 0) AS total_amount_pro_monthly,
        IFNULL(SUM(CASE WHEN type = 'pro_yearly'  THEN amount ELSE 0 END), 0) AS total_amount_pro_yearly
      FROM vnpay_transactions
    `);

    // 2.2. Danh sách user đã thanh toán (chỉ success)
    const [userRows] = await pool.query(`
      SELECT
        t.user_id,
        u.username,
        COUNT(*) AS total_transactions,
        IFNULL(SUM(t.amount), 0) AS total_amount
      FROM vnpay_transactions t
      LEFT JOIN Users u ON t.user_id = u.user_id
      GROUP BY t.user_id, u.username
      ORDER BY total_amount DESC
    `);

    res.json({
      status: true,
      summary: summaryRows[0], // tổng quan
      users: userRows          // danh sách user đã thanh toán
    });
  } catch (err) {
    console.error("SUMMARY ERROR:", err.message);
    res.status(500).json({
      status: false,
      message: "Lỗi khi lấy tổng quan thanh toán",
    });
  }
});

module.exports = router;
