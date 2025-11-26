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


module.exports = router;
