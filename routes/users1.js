const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const { pool } = require("../config/db");

router.get("/me", auth, async (req, res) => {
  try {
    const { user_id } = req.user;

    const [rows] = await pool.query(
      "SELECT user_id, username, email, role, package_type, package_expired_at FROM Users WHERE user_id = ?",
      [user_id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      success: true,
      user: rows[0]
    });
  } catch (err) {
    console.error("❌ Error /users/me:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// ===============================
// Lưu FCM token cho user
// ===============================
router.post("/update-fcm", async (req, res) => {
    try {
        const { user_id, fcm_token } = req.body;

        if (!user_id || !fcm_token) {
            return res.status(400).json({
                success: false,
                message: "Missing user_id or fcm_token",
            });
        }

        await pool.execute(
            `UPDATE Users SET fcm_token = ? WHERE user_id = ?`,
            [fcm_token, user_id]
        );

        res.json({
            success: true,
            message: "FCM token updated",
        });

    } catch (err) {
        console.error("❌ update-fcm error:", err);
        res.status(500).json({ success: false });
    }
});

module.exports = router;
