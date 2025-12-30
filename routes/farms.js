// routes/farms.js
const router = require('express').Router();
const { pool } = require('../config/db');
const auth = require('../middleware/auth');

// --------- Helper phân quyền ----------
const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ message: 'Không có quyền truy cập' });
  }
  next();
};

// --------- List farms + filter + paginate ----------
router.get('/', auth, async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(req.query.page_size) || 20, 1), 100);
    const offset = (page - 1) * pageSize;

    let where = '';
    const params = [];

    // Nếu KEEPER, chỉ thấy farm mình quản lý (user_id = manager_id)
    if (req.user.role === 'KEEPER') {
      where = 'WHERE f.manager_id = ?';
      params.push(req.user.user_id);
    }

    const [cnt] = await pool.query(
      `SELECT COUNT(*) AS total FROM Farms f ${where}`,
      params
    );

    const [rows] = await pool.query(
      `SELECT
         f.farm_id,
         f.farm_name,
         f.lat,
         f.lng,
         f.address,
         f.image_url,
         f.manager_id,
         u.full_name AS manager_name,
         -- số tổ ong trong trại
         (SELECT COUNT(*)
            FROM Hives h
            WHERE h.farm_id = f.farm_id
         ) AS hive_count,
         -- tổng sản lượng mật (kg) từ bảng honeys
         (SELECT COALESCE(SUM(ho.amount), 0)
            FROM Hives h
            JOIN honeys ho ON ho.hive_id = h.hive_id
           WHERE h.farm_id = f.farm_id
         ) AS total_honey_kg
       FROM Farms f
       JOIN Users u ON u.user_id = f.manager_id
       ${where}
       ORDER BY f.created_at DESC
       LIMIT ?, ?`,
      [...params, offset, pageSize]
    );

    res.json({
      data: rows,
      pagination: { page, page_size: pageSize, total: cnt[0].total },
    });
  } catch (e) {
    console.error('GET /farms', e);
    res.status(500).json({ message: 'Server error' });
  }
});

// --------- Farm detail ----------
router.get('/:id', auth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT
         f.*,
         u.full_name AS manager_name,
         u.email     AS manager_email,
         u.phone     AS manager_phone
       FROM Farms f
       JOIN Users u ON u.user_id = f.manager_id
       WHERE f.farm_id = ?`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Not found' });

    // KEEPER chỉ xem farm của mình
    if (req.user.role === 'KEEPER' && rows[0].manager_id !== req.user.user_id) {
      return res.status(403).json({ message: 'Không có quyền xem farm này' });
    }

    res.json(rows[0]);
  } catch (e) {
    console.error('GET /farms/:id', e);
    res.status(500).json({ message: 'Server error' });
  }
});

// --------- Hives of a farm ----------
router.get('/:id/hives', auth, async (req, res) => {
  try {
    // Nếu KEEPER, check quyền trước
    if (req.user.role === 'KEEPER') {
      const [farm] = await pool.query(
        `SELECT manager_id FROM Farms WHERE farm_id = ?`,
        [req.params.id]
      );
      if (!farm.length || farm[0].manager_id !== req.user.user_id) {
        return res.status(403).json({ message: 'Không có quyền xem hives này' });
      }
    }

    const [rows] = await pool.query(
  `SELECT hive_id, hive_name, status, queen_count, frame_count, queen_status, 
          location, notes, creation_date, created_at, updated_at, image_url
   FROM Hives
   WHERE farm_id = ? AND is_deleted = 0
   ORDER BY hive_id DESC`,
  [req.params.id]
);

    // const [rows] = await pool.query(
    //   `SELECT hive_id, hive_name, status
    //    FROM Hives
    //    WHERE farm_id = ?
    //    ORDER BY hive_id DESC`,
    //   [req.params.id]
    // );

    res.json(rows);
  } catch (e) {
    console.error('GET /farms/:id/hives', e);
    res.status(500).json({ message: 'Server error' });
  }
});

// --------- Monthly production of a farm (dùng honeys, đủ 12 tháng) ----------
router.get('/:id/monthly-production', auth, async (req, res) => {
  try {
    const year = Number(req.query.year) || new Date().getFullYear();
    const farmId = req.params.id;

    // Nếu KEEPER, kiểm tra quyền
    if (req.user.role === 'KEEPER') {
      const [farm] = await pool.query(
        `SELECT manager_id FROM Farms WHERE farm_id = ?`,
        [farmId]
      );
      if (!farm.length || farm[0].manager_id !== req.user.user_id) {
        return res.status(403).json({ message: 'Không có quyền xem production này' });
      }
    }

    // Query tổng sản lượng theo tháng từ bảng honeys
    const [rows] = await pool.query(
      `SELECT
          MONTH(ho.date) AS month,
          ROUND(SUM(ho.amount), 2) AS total_kg
       FROM Hives h
       JOIN honeys ho ON ho.hive_id = h.hive_id
       WHERE h.farm_id = ?
         AND YEAR(ho.date) = ?
       GROUP BY MONTH(ho.date)
       ORDER BY month`,
      [farmId, year]
    );

    // Luôn trả đủ 12 tháng
    const data = [];
    for (let m = 1; m <= 12; m++) {
      const row = rows.find(r => Number(r.month) === m);
      data.push({
        month: m,
        total_kg: row ? Number(row.total_kg) : 0,
      });
    }

    res.json({ year, data });
  } catch (e) {
    console.error('GET /farms/:id/monthly-production', e);
    res.status(500).json({ message: 'Server error' });
  }
});

// --------- Create farm (ADMIN only) ----------
// router.post('/', auth, authorize('ADMIN'), async (req, res) => {
//   try {
//     const { farm_name, manager_id, lat, lng, address } = req.body;
//     if (!farm_name || !manager_id) {
//       return res
//         .status(400)
//         .json({ message: 'farm_name & manager_id required' });
//     }

//     const [r] = await pool.query(
//       `INSERT INTO Farms (farm_name, manager_id, lat, lng, address)
//        VALUES (?,?,?,?,?)`,
//       [farm_name, manager_id, lat ?? null, lng ?? null, address ?? null]
//     );
//     res.status(201).json({ farm_id: r.insertId });
//   } catch (e) {
//     console.error('POST /farms', e);
//     res
//       .status(400)
//       .json({ message: e.code || 'INSERT_ERROR', detail: e.sqlMessage });
//   }
// });

// // --------- Create farm (ADMIN + KEEPER) ----------
// router.post('/', auth, authorize('ADMIN', 'KEEPER'), async (req, res) => {
//   try {
//     const { farm_name, manager_id, lat, lng, address } = req.body;
//     const { user_id, role } = req.user;

//     if (!farm_name) {
//       return res.status(400).json({ message: 'farm_name is required' });
//     }

//     let effectiveManagerId = manager_id;

//     // Nếu là chủ trại (KEEPER) thì:
//     //  - Không cho chỉ định manager_id
//     //  - Ép manager_id = chính user hiện tại
//     //  - (Tùy chọn) kiểm tra giới hạn số farm free
//     if (role === 'KEEPER') {
//       effectiveManagerId = user_id;

//       // Ví dụ: giới hạn 1 farm miễn phí cho mỗi chủ trại (sau này gắn thanh toán)
//       const [cnt] = await pool.query(
//         'SELECT COUNT(*) AS total FROM Farms WHERE manager_id = ?',
//         [user_id]
//       );
//       const MAX_FREE_FARMS = 1; // chỉnh số này theo gói free/pro của bạn

//       if (cnt[0].total >= MAX_FREE_FARMS) {
//         return res.status(403).json({
//           message:
//             'Bạn đã đạt giới hạn số trại ong cho gói hiện tại. Vui lòng nâng cấp gói để tạo thêm trại.',
//         });
//       }
//     }

//     // Với ADMIN: nếu không truyền manager_id thì báo lỗi (giống logic cũ)
//     if (!effectiveManagerId) {
//       return res
//         .status(400)
//         .json({ message: 'manager_id required for admin' });
//     }

//     const [r] = await pool.query(
//       `INSERT INTO Farms (farm_name, manager_id, lat, lng, address)
//        VALUES (?,?,?,?,?)`,
//       [farm_name, effectiveManagerId, lat ?? null, lng ?? null, address ?? null]
//     );

//     res.status(201).json({ farm_id: r.insertId });
//   } catch (e) {
//     console.error('POST /farms', e);
//     res
//       .status(400)
//       .json({ message: e.code || 'INSERT_ERROR', detail: e.sqlMessage });
//   }
// });

// --------- Create farm (ADMIN + KEEPER) ----------
// router.post('/', auth, authorize('ADMIN', 'KEEPER'), async (req, res) => {
//   try {
//     const { farm_name, manager_id, lat, lng, address } = req.body;
//     const { user_id, role } = req.user;

//     if (!farm_name) {
//       return res.status(400).json({ message: 'farm_name is required' });
//     }

//     let effectiveManagerId = manager_id;

//     // Nếu là KEEPER → tự động làm manager
//     if (role === 'KEEPER') {
//       effectiveManagerId = user_id;

//       // Giới hạn FREE: chỉ 1 farm
//       const [cnt] = await pool.query(
//         'SELECT COUNT(*) AS total FROM Farms WHERE manager_id = ?',
//         [user_id]
//       );

//       if (cnt[0].total >= 1) {
//         return res.status(403).json({
//           message: 'Gói FREE chỉ được tạo 1 farm. Hãy nâng cấp PRO để tạo thêm.',
//         });
//       }
//     }

//     // Nếu ADMIN mà không gửi manager_id → auto gán = ADMIN luôn
//     if (role === 'ADMIN' && !effectiveManagerId) {
//       effectiveManagerId = user_id;
//     }

//     const [r] = await pool.query(
//       `INSERT INTO Farms (farm_name, manager_id, lat, lng, address)
//        VALUES (?,?,?,?,?)`,
//       [farm_name, effectiveManagerId, lat ?? null, lng ?? null, address ?? null]
//     );

//     res.status(201).json({ farm_id: r.insertId });

//   } catch (e) {
//     console.error('POST /farms', e);
//     res.status(400).json({ message: e.code || 'INSERT_ERROR', detail: e.sqlMessage });
//   }
// });
// router.post('/', auth, authorize('ADMIN', 'KEEPER'), async (req, res) => {
//   try {
//     const { farm_name, manager_id, lat, lng, address } = req.body;
//     const { user_id, role, package_type, package_expired_at } = req.user;

//     if (!farm_name || !farm_name.trim()) {
//       return res.status(400).json({
//         success: false,
//         message: 'farm_name is required'
//       });
//     }

//     let effectiveManagerId = manager_id || null;

//     // Check PRO + còn hạn
//     let isPro =
//       package_type &&
//       package_type.startsWith("pro") &&
//       (!package_expired_at || new Date(package_expired_at) > new Date());

//     // ================== KEEPER ==================
//     if (role === 'KEEPER') {
//       effectiveManagerId = user_id;

//       const [cnt] = await pool.query(
//         'SELECT COUNT(*) AS total FROM Farms WHERE manager_id = ?',
//         [user_id]
//       );

//       // Nếu không phải PRO → giới hạn 1 farm
//       if (!isPro && cnt[0].total >= 1) {
//         return res.status(403).json({
//           success: false,
//           message: 'Gói FREE chỉ được tạo 1 farm. Hãy nâng cấp PRO để tạo thêm.'
//         });
//       }
//     }

//     // ================== ADMIN ==================
//     if (role === 'ADMIN' && !effectiveManagerId) {
//       effectiveManagerId = user_id;
//     }

//     const [r] = await pool.query(
//       `INSERT INTO Farms (farm_name, manager_id, lat, lng, address)
//        VALUES (?, ?, ?, ?, ?)`,
//       [
//         farm_name.trim(),
//         effectiveManagerId,
//         lat ?? null,
//         lng ?? null,
//         address ?? null
//       ]
//     );

//     res.status(201).json({
//       success: true,
//       message: 'Tạo trại ong thành công',
//       farm_id: r.insertId,
//       isPro
//     });

//   } catch (e) {
//     console.error('POST /farms error:', e);

//     res.status(500).json({
//       success: false,
//       message: e.code || 'INSERT_ERROR',
//       detail: e.sqlMessage || e.message
//     });
//   }
// });

// router.post('/', auth, authorize('ADMIN', 'KEEPER'), async (req, res) => {
//   try {
//     const { farm_name, manager_id, lat, lng, address, image_url } = req.body;
//     const { user_id, role, package_type, package_expired_at } = req.user;

//     if (!farm_name || !farm_name.trim()) {
//       return res.status(400).json({
//         success: false,
//         message: 'farm_name is required'
//       });
//     }

//     let effectiveManagerId = manager_id || null;

//     // Check PRO + còn hạn
//     let isPro =
//       package_type &&
//       package_type.startsWith("pro") &&
//       (!package_expired_at || new Date(package_expired_at) > new Date());

//     // ================== KEEPER ==================
//     if (role === 'KEEPER') {
//       effectiveManagerId = user_id;

//       const [cnt] = await pool.query(
//         'SELECT COUNT(*) AS total FROM Farms WHERE manager_id = ?',
//         [user_id]
//       );

//       // FREE chỉ tạo 1 farm
//       if (!isPro && cnt[0].total >= 1) {
//         return res.status(403).json({
//           success: false,
//           message: 'Gói FREE chỉ được tạo 1 farm. Hãy nâng cấp PRO để tạo thêm.'
//         });
//       }
//     }

//     // ================== ADMIN ==================
//     if (role === 'ADMIN' && !effectiveManagerId) {
//       effectiveManagerId = user_id;
//     }

//     const [r] = await pool.query(
//       `INSERT INTO Farms (farm_name, manager_id, lat, lng, address, image_url)
//        VALUES (?, ?, ?, ?, ?, ?)`,
//       [
//         farm_name.trim(),
//         effectiveManagerId,
//         lat ?? null,
//         lng ?? null,
//         address ?? null,
//         image_url ?? null
//       ]
//     );

//     res.status(201).json({
//       success: true,
//       message: 'Tạo trại ong thành công',
//       farm_id: r.insertId,
//       isPro
//     });

//   } catch (e) {
//     console.error('POST /farms error:', e);

//     res.status(500).json({
//       success: false,
//       message: e.code || 'INSERT_ERROR',
//       detail: e.sqlMessage || e.message
//     });
//   }
// });
const upload = require("../middleware/upload");
const cloudinary = require("../config/cloudinary");

/**
 * 🐝 POST /api/farms (create farm)
 */
router.post(
  '/',
  auth,
  authorize('ADMIN', 'KEEPER'),
  upload.single('image'), // 👈 nhận ảnh
  async (req, res) => {
    try {
      const { farm_name, manager_id, lat, lng, address } = req.body;
      const { user_id, role, package_type, package_expired_at } = req.user;

      if (!farm_name || !farm_name.trim()) {
        return res.status(400).json({
          success: false,
          message: 'farm_name is required'
        });
      }

      let effectiveManagerId = manager_id || null;

      // ================== PRO CHECK ==================
      const isPro =
        package_type &&
        package_type.startsWith("pro") &&
        (!package_expired_at || new Date(package_expired_at) > new Date());

      // ================== KEEPER ==================
      if (role === 'KEEPER') {
        effectiveManagerId = user_id;

        const [cnt] = await pool.query(
          'SELECT COUNT(*) AS total FROM Farms WHERE manager_id = ? AND is_deleted = 0',
          [user_id]
        );

        // FREE chỉ tạo 1 farm
        if (!isPro && cnt[0].total >= 1) {
          return res.status(403).json({
            success: false,
            message: 'Gói FREE chỉ được tạo 1 farm. Hãy nâng cấp PRO để tạo thêm.'
          });
        }
      }

      // ================== ADMIN ==================
      if (role === 'ADMIN' && !effectiveManagerId) {
        effectiveManagerId = user_id;
      }

      // ================== UPLOAD CLOUDINARY ==================
      let image_url = null;

      if (req.file) {
        const uploadResult = await new Promise((resolve, reject) => {
          cloudinary.uploader
            .upload_stream(
              {
                folder: 'farms',
                resource_type: 'image'
              },
              (err, result) => {
                if (err) reject(err);
                else resolve(result);
              }
            )
            .end(req.file.buffer);
        });

        image_url = uploadResult.secure_url;
      }

      // ================== INSERT FARM ==================
      const [r] = await pool.query(
        `INSERT INTO Farms (farm_name, manager_id, lat, lng, address, image_url)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          farm_name.trim(),
          effectiveManagerId,
          lat ?? null,
          lng ?? null,
          address ?? null,
          image_url
        ]
      );

      res.status(201).json({
        success: true,
        message: 'Tạo trại ong thành công',
        farm_id: r.insertId,
        image_url,
        isPro
      });

    } catch (e) {
      console.error('❌ POST /farms error:', e);

      res.status(500).json({
        success: false,
        message: e.code || 'INSERT_ERROR',
        detail: e.sqlMessage || e.message
      });
    }
  }
);





// // --------- Update farm (ADMIN only) ----------
// router.put('/:id', auth, authorize('ADMIN'), async (req, res) => {
//   try {
//     const fields = ['farm_name', 'manager_id', 'lat', 'lng', 'address'];
//     const data = Object.fromEntries(
//       Object.entries(req.body).filter(([k]) => fields.includes(k))
//     );

//     const sets = [];
//     const params = [];
//     for (const [k, v] of Object.entries(data)) {
//       sets.push(`${k} = ?`);
//       params.push(v);
//     }
//     if (!sets.length) return res.json({ success: true });
//     params.push(req.params.id);

//     const [r] = await pool.query(
//       `UPDATE Farms SET ${sets.join(', ')} WHERE farm_id = ?`,
//       params
//     );
//     if (!r.affectedRows) {
//       return res.status(404).json({ message: 'Not found' });
//     }
//     res.json({ success: true });
//   } catch (e) {
//     console.error('PUT /farms/:id', e);
//     res
//       .status(400)
//       .json({ message: e.code || 'UPDATE_ERROR', detail: e.sqlMessage });
//   }
// });

// --------- Update farm (ADMIN only) ----------
router.put(
  '/:id',
  auth,
  authorize('ADMIN'),
  upload.single('image_url'), // ⚠️ BẮT BUỘC
  async (req, res) => {
    try {
      const fields = ['farm_name', 'manager_id', 'lat', 'lng', 'address'];
      const data = Object.fromEntries(
        Object.entries(req.body).filter(([k]) => fields.includes(k))
      );

      // nếu có upload ảnh
      if (req.file) {
        const result = await cloudinary.uploader.upload(
          `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`,
          { folder: 'farms' }
        );
        data.image_url = result.secure_url;
      }

      const sets = [];
      const params = [];

      for (const [k, v] of Object.entries(data)) {
        sets.push(`${k} = ?`);
        params.push(v);
      }

      if (!sets.length) {
        return res.json({
          success: true,
          message: 'Không có dữ liệu nào để update'
        });
      }

      params.push(req.params.id);

      const [r] = await pool.query(
        `UPDATE Farms SET ${sets.join(', ')} WHERE farm_id = ?`,
        params
      );

      if (!r.affectedRows) {
        return res.status(404).json({ message: 'Farm không tồn tại' });
      }

      res.json({ success: true, message: 'Cập nhật thành công' });

    } catch (e) {
      console.error('PUT /farms/:id', e);
      res.status(400).json({
        success: false,
        message: e.code || 'UPDATE_ERROR',
        detail: e.message
      });
    }
  }
);



// --------- Delete farm (ADMIN only) ----------
router.delete('/:id', auth, authorize('ADMIN'), async (req, res) => {
  try {
    const [r1] = await pool.query(
      `SELECT COUNT(*) AS c FROM Hives WHERE farm_id = ?`,
      [req.params.id]
    );
    if (r1[0].c > 0) {
      return res.status(409).json({
        message: 'Farm has hives. Reassign or delete hives first.',
      });
    }

    const [r] = await pool.query(
      `DELETE FROM Farms WHERE farm_id = ?`,
      [req.params.id]
    );
    if (!r.affectedRows) {
      return res.status(404).json({ message: 'Not found' });
    }
    res.json({ success: true });
  } catch (e) {
    console.error('DELETE /farms/:id', e);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
