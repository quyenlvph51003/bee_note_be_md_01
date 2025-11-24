const router = require("express").Router();
const { pool } = require("../config/db");
const bcrypt = require("bcrypt");
const auth = require("../middleware/auth");
const authorize = require("../middleware/authorize"); // chỉ ADMIN

// TẤT CẢ ROUTE BÊN DƯỚI CHỈ ADMIN ĐƯỢC DÙNG
router.use(auth, authorize("ADMIN"));

// =======================
// List + search + paginate (ADMIN only)
// =======================
router.get("/", async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(req.query.page_size) || 20, 1), 100);
    const offset = (page - 1) * pageSize;
    const search = (req.query.search || "").trim();
    const role = (req.query.role || "").trim(); // ví dụ: 'KEEPER'

    const params = [];
    let where = " WHERE 1=1 ";

    // search theo tên / email / username
    if (search) {
      where +=
        " AND (u.full_name LIKE ? OR u.email LIKE ? OR u.username LIKE ?) ";
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    // lọc theo role (để list Chủ trại dùng ?role=KEEPER)
    if (role) {
      where += " AND u.role = ? ";
      params.push(role);
    }

    // tổng số dòng
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM Users u ${where}`,
      params
    );

    // dữ liệu + thống kê
    const [rows] = await pool.query(
      `SELECT 
          u.user_id,
          u.username,
          u.full_name,
          u.email,
          u.phone,
          u.role,
          u.is_active,

          -- Số trại
          (SELECT COUNT(*)
             FROM Farms f
            WHERE f.manager_id = u.user_id
          ) AS farms_count,

          -- Số tổ ong trong các trại của user
          (SELECT COUNT(*)
             FROM Hives h
             JOIN Farms f ON h.farm_id = f.farm_id
            WHERE f.manager_id = u.user_id
          ) AS hive_count,

          -- Tổng nhật ký trong bảng diarys
          (SELECT COALESCE(COUNT(*), 0)
             FROM diarys d
             JOIN Hives h ON d.hive_id = h.hive_id
             JOIN Farms f ON h.farm_id = f.farm_id
            WHERE f.manager_id = u.user_id
          ) AS diary_count,

          -- Số cảnh báo / thông báo chưa đọc
          (SELECT COALESCE(COUNT(*), 0)
             FROM Notifications n
            WHERE n.user_id = u.user_id
              AND n.is_read = 0
          ) AS alert_count

       FROM Users u
       ${where}
       ORDER BY u.created_at DESC
       LIMIT ?, ?`,
      [...params, offset, pageSize]
    );

    res.json({ data: rows, pagination: { page, page_size: pageSize, total } });
  } catch (e) {
    console.error("GET /users", e);
    res.status(500).json({ message: "Server error" });
  }
});

// =======================
// Detail (ADMIN only)
// =======================
router.get("/:id", async (req, res) => {
  try {
    const userId = Number(req.params.id);

    const [rows] = await pool.query(
      `SELECT user_id, username, full_name, email, phone, role, is_active, created_at
       FROM Users WHERE user_id = ?`,
      [userId]
    );
    if (!rows.length) return res.status(404).json({ message: "Not found" });

    const [[{ farms_count }]] = await pool.query(
      `SELECT COUNT(*) AS farms_count FROM Farms WHERE manager_id = ?`,
      [userId]
    );

    res.json({ user: rows[0], farms_count });
  } catch (e) {
    console.error("GET /users/:id", e);
    res.status(500).json({ message: "Server error" });
  }
});

// =======================
// Create user (ADMIN only)
// =======================
router.post("/", async (req, res) => {
  try {
    const { username, password, full_name, email, phone, role } = req.body;
    if (!username || !password || !full_name || !email || !role)
      return res.status(400).json({ message: "Missing fields" });

    const hash = await bcrypt.hash(password, 10);
    const [r] = await pool.query(
      `INSERT INTO Users (username, password, full_name, email, phone, role, is_active)
       VALUES (?,?,?,?,?,?,1)`,
      [username, hash, full_name, email, phone || null, role]
    );
    res.status(201).json({ user_id: r.insertId });
  } catch (e) {
    console.error("POST /users", e);
    res
      .status(400)
      .json({ message: e.code || "INSERT_ERROR", detail: e.sqlMessage });
  }
});

// =======================
// Update user (ADMIN only)
// =======================
router.put("/:id", async (req, res) => {
  try {
    const fields = [
      "username",
      "password",
      "full_name",
      "email",
      "phone",
      "role",
      "is_active",
    ];
    const input = Object.fromEntries(
      Object.entries(req.body).filter(([k]) => fields.includes(k))
    );

    if (input.password) input.password = await bcrypt.hash(input.password, 10);

    const sets = [];
    const params = [];
    for (const [k, v] of Object.entries(input)) {
      sets.push(`${k} = ?`);
      params.push(v);
    }
    if (!sets.length) return res.json({ success: true });
    params.push(req.params.id);

    const [r] = await pool.query(
      `UPDATE Users SET ${sets.join(", ")} WHERE user_id = ?`,
      params
    );
    if (!r.affectedRows) return res.status(404).json({ message: "Not found" });
    res.json({ success: true });
  } catch (e) {
    console.error("PUT /users/:id", e);
    res
      .status(400)
      .json({ message: e.code || "UPDATE_ERROR", detail: e.sqlMessage });
  }
});

// =======================
// Update role user (ADMIN only)
// =======================
router.patch("/:id/role", async (req, res) => {
  try {
    const { role } = req.body;
    if (!role) {
      return res.status(400).json({ message: "Missing role" });
    }

    const allowedRoles = ["ADMIN", "KEEPER"];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }

    const [r] = await pool.query(
      "UPDATE Users SET role = ? WHERE user_id = ?",
      [role, req.params.id]
    );

    if (!r.affectedRows) {
      return res.status(404).json({ message: "Not found" });
    }

    res.json({ success: true });
  } catch (e) {
    console.error("PATCH /users/:id/role", e);
    res.status(500).json({ message: "Server error" });
  }
});

// =======================
// Lock / Unlock user (ADMIN only)
// =======================
router.patch("/:id/status", async (req, res) => {
  try {
    const isActive = Number(Boolean(req.body.is_active));
    const [r] = await pool.query(
      `UPDATE Users SET is_active = ? WHERE user_id = ?`,
      [isActive, req.params.id]
    );
    if (!r.affectedRows) return res.status(404).json({ message: "Not found" });
    res.json({ success: true });
  } catch (e) {
    console.error("PATCH /users/:id/status", e);
    res.status(500).json({ message: "Server error" });
  }
});

// =======================
// Delete user (ADMIN only)
// =======================
router.delete("/:id", async (req, res) => {
  try {
    const [r] = await pool.query(
      `DELETE FROM Users WHERE user_id = ?`,
      [req.params.id]
    );
    if (!r.affectedRows) return res.status(404).json({ message: "Not found" });
    res.json({ success: true });
  } catch (e) {
    console.error("DELETE /users/:id", e);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
