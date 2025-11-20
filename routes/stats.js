// routes/stats.js
const router = require('express').Router();
const { pool } = require('../config/db');
const auth = require('../middleware/auth');

// Helper phân quyền
const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ message: 'Không có quyền truy cập' });
  }
  next();
};

// 1) Tổng số người nuôi ong (ADMIN only)
router.get('/beekeepers-count', auth, authorize('ADMIN'), async (_req, res) => {
  try {
    const [r] = await pool.query(
      "SELECT COUNT(*) AS total_beekeepers FROM Users WHERE role = 'KEEPER'"
    );
    res.json(r[0]);
  } catch (err) {
    console.error('beekeepers-count:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// 2) Tổng số chủ trại, tổ, tổng sản lượng (dùng bảng honeys)
router.get('/summary', auth, async (req, res) => {
  try {
    // ----- 1. Tổng số CHỦ TRẠI (không phụ thuộc role đang đăng nhập) -----
    const [[{ total_beekeepers }]] = await pool.query(
      "SELECT COUNT(*) AS total_beekeepers FROM Users WHERE role = 'KEEPER'"
    );

    // ----- 2. Tổng số tổ ong & tổng sản lượng (có filter theo KEEPER) -----
    const params = [];
    let hivesWhere = '';
    let honeyWhere = '';

    // Nếu KEEPER: chỉ tính các farm do mình quản lý
    if (req.user.role === 'KEEPER') {
      hivesWhere = 'WHERE f.manager_id = ?';
      honeyWhere = 'WHERE f.manager_id = ?';
      // 2 subquery => 2 lần ?
      params.push(req.user.user_id, req.user.user_id);
    }

    const [r] = await pool.query(
      `SELECT
         -- Tổng số tổ ong
         (SELECT COUNT(*)
          FROM Hives h
          JOIN Farms f ON h.farm_id = f.farm_id
          ${hivesWhere}
         ) AS total_hives,

         -- Tổng sản lượng mật (kg) từ bảng honeys
         (SELECT COALESCE(SUM(ho.amount), 0)
          FROM Hives h
          JOIN honeys ho ON ho.hive_id = h.hive_id
          JOIN Farms f ON h.farm_id = f.farm_id
          ${honeyWhere}
         ) AS total_honey_kg`,
      params
    );

    // ghép kết quả lại trả cho FE
    res.json({
      total_beekeepers,          // Tổng CHỦ TRẠI
      total_hives: r[0].total_hives,
      total_honey_kg: r[0].total_honey_kg,
    });
  } catch (err) {
    console.error('summary:', err);
    res.status(500).json({ message: 'Server error' });
  }
});


// 3) Biểu đồ sản lượng theo tháng (dùng honeys, đủ 12 tháng)
router.get('/monthly-production', auth, async (req, res) => {
  try {
    const year = Number(req.query.year) || new Date().getFullYear();
    let whereHive = '';
    const params = [year];

    if (req.user.role === 'KEEPER') {
      whereHive = 'AND f.manager_id = ?';
      params.push(req.user.user_id);
    }

    const [rows] = await pool.query(
      `SELECT 
          MONTH(ho.date) AS month, 
          ROUND(SUM(ho.amount), 2) AS total_kg
       FROM Hives h
       JOIN honeys ho ON ho.hive_id = h.hive_id
       JOIN Farms f ON h.farm_id = f.farm_id
       WHERE YEAR(ho.date) = ? ${whereHive}
       GROUP BY MONTH(ho.date)
       ORDER BY month`,
      params
    );

    // luôn trả đủ 12 tháng, tháng nào không có dữ liệu thì = 0
    const monthData = [];
    for (let m = 1; m <= 12; m++) {
      const row = rows.find(r => Number(r.month) === m);
      monthData.push({
        month: m,
        total_kg: row ? Number(row.total_kg) : 0,
      });
    }

    res.json({ year, data: monthData });
  } catch (err) {
    console.error('monthly-production:', err);
    res.status(500).json({ message: 'Server error' });
  }
});


// 4) Sức khỏe tổ ong
router.get('/hive-health', auth, async (req, res) => {
  try {
    let whereHive = '';
    const params = [];

    if (req.user.role === 'KEEPER') {
      whereHive = 'WHERE f.manager_id = ?';
      params.push(req.user.user_id);
    }

    const [rows] = await pool.query(
      `SELECT h.status AS tinh_trang, COUNT(*) AS so_luong
       FROM Hives h
       JOIN Farms f ON h.farm_id = f.farm_id
       ${whereHive}
       GROUP BY h.status`,
      params
    );

    res.json(rows);
  } catch (err) {
    console.error('hive-health:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// 5) Top trại theo sản lượng (dùng honeys)
router.get('/top-farms', auth, async (req, res) => {
  try {
    const year = Number(req.query.year) || new Date().getFullYear();
    const limit = Math.min(Math.max(Number(req.query.limit) || 5, 1), 50);
    let whereFarm = '';
    const params = [year];

    if (req.user.role === 'KEEPER') {
      whereFarm = 'AND f.manager_id = ?';
      params.push(req.user.user_id);
    }

    const [rows] = await pool.query(
      `SELECT 
          f.farm_id, 
          f.farm_name, 
          ROUND(SUM(ho.amount), 2) AS total_kg
       FROM Farms f
       JOIN Hives h ON h.farm_id = f.farm_id
       JOIN honeys ho ON ho.hive_id = h.hive_id
       WHERE YEAR(ho.date) = ? ${whereFarm}
       GROUP BY f.farm_id, f.farm_name
       ORDER BY total_kg DESC
       LIMIT ?`,
      [...params, limit]
    );

    res.json({ year, limit, data: rows });
  } catch (err) {
    console.error('top-farms:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// 6) Thống kê sản lượng theo NÔNG DÂN (ADMIN only)
router.get(
  "/beekeepers-production",
  auth,
  authorize("ADMIN"),
  async (req, res) => {
    try {
      // optional: lọc theo năm nếu muốn, vd ?year=2024
      const year = Number(req.query.year);
      const hasYear = !Number.isNaN(year);

      // optional: lọc 1 nông dân cụ thể, vd ?keeper_id=12
      const keeperId = Number(req.query.keeper_id);
      const hasKeeper = !Number.isNaN(keeperId);

      // optional: lọc theo trạng thái
      // FE gửi: status = 'all' | 'active' | 'inactive'
      const status = (req.query.status || "all").toString().toLowerCase();

      const params = [];

      // điều kiện năm đặt trong JOIN để vẫn giữ LEFT JOIN
      let yearCondition = "";
      if (hasYear) {
        yearCondition = " AND YEAR(ho.date) = ?";
        params.push(year); // ? thứ 1
      }

      // điều kiện filter theo 1 nông dân (nếu có)
      let keeperCondition = "";
      if (hasKeeper) {
        keeperCondition = " AND u.user_id = ?";
        params.push(keeperId); // ? thứ 2 (nếu có)
      }

      // điều kiện trạng thái (hoạt động / không hoạt động)
      let statusCondition = "";
      if (status === "active") {
        statusCondition = " AND u.is_active = 1";
      } else if (status === "inactive") {
        statusCondition = " AND u.is_active = 0";
      }
      // nếu status = 'all' thì không thêm điều kiện gì

      const [rows] = await pool.query(
        `
        SELECT
          u.user_id,
          u.full_name,
          u.email,
          u.is_active,

          -- số tổ ong (distinct vì 1 tổ có nhiều lần thu hoạch)
          COUNT(DISTINCT h.hive_id) AS hive_count,

          -- tổng sản lượng (kg)
          COALESCE(SUM(ho.amount), 0) AS total_honey_kg,

          -- TB/tổ (kg) = tổng / số tổ
          ROUND(
            COALESCE(SUM(ho.amount), 0) /
            NULLIF(COUNT(DISTINCT h.hive_id), 0),
            2
          ) AS avg_honey_per_hive_kg,

          -- ngày thu hoạch gần nhất
          MAX(ho.date) AS last_harvest_date

        FROM Users u
        LEFT JOIN Farms f
          ON f.manager_id = u.user_id
        LEFT JOIN Hives h
          ON h.farm_id = f.farm_id
        LEFT JOIN honeys ho
          ON ho.hive_id = h.hive_id
          ${yearCondition}          -- AND YEAR(ho.date)=?
        WHERE
          u.role = 'KEEPER'
          ${keeperCondition}        -- AND u.user_id = ?
          ${statusCondition}        -- AND u.is_active = 1/0 (nếu có)
        GROUP BY
          u.user_id, u.full_name, u.email, u.is_active
        ORDER BY
          u.full_name ASC
        `,
        params
      );

      // Tính 3 ô summary trên UI từ kết quả bảng (đã apply filter)
      let totalFarmers = 0;
      let totalHives = 0;
      let totalHoneyKg = 0;

      const data = rows.map((r) => {
        const hiveCount = Number(r.hive_count || 0);
        const totalKg = Number(r.total_honey_kg || 0);

        totalFarmers += 1;
        totalHives += hiveCount;
        totalHoneyKg += totalKg;

        return {
          user_id: r.user_id,
          full_name: r.full_name,
          email: r.email,
          is_active: r.is_active, // FE map sang "Hoạt Động"/"Không Hoạt Động"
          hive_count: hiveCount, // cột "Tổ Ong"
          total_honey_kg: totalKg, // "Tổng Sản Lượng (kg)"
          avg_honey_per_hive_kg: Number(r.avg_honey_per_hive_kg || 0), // "TB/Tổ (kg)"
          last_harvest_date: r.last_harvest_date, // "Thu Hoạch Gần Nhất"
        };
      });

      res.json({
        summary: {
          total_beekeepers: totalFarmers, // "Tổng Nông Dân"
          total_hives: totalHives, // "Tổng Tổ Ong"
          total_honey_kg: totalHoneyKg, // "Tổng Sản Lượng (kg)"
        },
        data,
      });
    } catch (err) {
      console.error("beekeepers-production:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);



/**
 * Thống kê chi tiết TRONG 1 TRẠI ONG
 * GET /api/stats/farms/:farmId
 *
 * Trả về:
 *  - Thông tin trại
 *  - Tổng số tổ ong
 *  - Tổng lượng mật (kg) trong trại
 *  - Lượng mật theo ngày (30 ngày gần nhất)
 *  - Số tổ theo từng trạng thái (status)
 *  - Danh sách từng tổ: hive_id, hive_name, status, tổng mật, ngày thu gần nhất
 *
 * ADMIN: xem mọi trại
 * KEEPER: chỉ trại có manager_id = user_id
 */
router.get(
  '/farms/:farmId',
  auth,
  authorize('ADMIN', 'KEEPER'),
  async (req, res) => {
    const ownerId = req.user.user_id;
    const role = String(req.user.role).toUpperCase();
    const isAdmin = role === 'ADMIN';
    const { farmId } = req.params;

    try {
      // 1. Kiểm tra farm có thuộc quyền xem hay không
      let farmSql = 'SELECT * FROM Farms WHERE farm_id = ?';
      const farmParams = [farmId];

      if (!isAdmin) {
        farmSql += ' AND manager_id = ?';
        farmParams.push(ownerId);
      }

      const [farmRows] = await pool.query(farmSql, farmParams);

      if (!farmRows.length) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy trại hoặc bạn không có quyền truy cập.',
        });
      }

      const farm = farmRows[0];

      // 2. Tổng số tổ ong trong trại
      const [totalHiveRows] = await pool.query(
        `
        SELECT COUNT(*) AS total_hives
        FROM Hives
        WHERE farm_id = ?
        `,
        [farmId]
      );

      const totalHives = totalHiveRows[0]?.total_hives || 0;

      // 3. Tổng lượng mật trong trại (từ bảng honeys)
      const [totalHoneyRows] = await pool.query(
        `
        SELECT COALESCE(SUM(ho.amount), 0) AS total_honey_kg
        FROM Hives h
        JOIN honeys ho ON ho.hive_id = h.hive_id
        WHERE h.farm_id = ?
        `,
        [farmId]
      );

      const totalHoneyKg = totalHoneyRows[0]?.total_honey_kg || 0;

      // 4. Lượng mật theo ngày (30 ngày gần nhất)
      const [honeyByDay] = await pool.query(
        `
        SELECT 
          DATE(ho.date) AS day,
          ROUND(SUM(ho.amount), 2) AS total_honey_kg
        FROM Hives h
        JOIN honeys ho ON ho.hive_id = h.hive_id
        WHERE h.farm_id = ?
          AND ho.date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
        GROUP BY DATE(ho.date)
        ORDER BY day
        `,
        [farmId]
      );

      // 5. Số tổ theo trạng thái (status)
      const [statusRows] = await pool.query(
        `
        SELECT h.status AS tinh_trang, COUNT(*) AS so_luong
        FROM Hives h
        WHERE h.farm_id = ?
        GROUP BY h.status
        `,
        [farmId]
      );

      // 6. Thống kê từng tổ: tổng mật + ngày thu gần nhất
      const [hiveStatsRows] = await pool.query(
        `
        SELECT 
          h.hive_id,
          h.hive_name,
          h.status,
          COALESCE(SUM(ho.amount), 0) AS total_honey_kg,
          MAX(ho.date) AS last_harvest_date
        FROM Hives h
        LEFT JOIN honeys ho ON ho.hive_id = h.hive_id
        WHERE h.farm_id = ?
        GROUP BY h.hive_id, h.hive_name, h.status
        ORDER BY h.hive_id
        `,
        [farmId]
      );

      return res.json({
        success: true,
        data: {
          farm,
          summary: {
            total_hives: totalHives,
            total_honey_kg: totalHoneyKg,
          },
          honeyByDay,
          by_status: statusRows,
          hives: hiveStatsRows,
        },
      });
    } catch (error) {
      console.error('Error in /stats/farms/:farmId:', error);
      return res.status(500).json({
        success: false,
        message: 'Lỗi server khi thống kê trong trại ong.',
      });
    }
  }
);

module.exports = router;
