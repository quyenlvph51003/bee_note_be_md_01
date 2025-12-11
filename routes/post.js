/// file vừa tạo

// routes/post.js
const router = require('express').Router();
const { pool } = require('../config/db');
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');

// --------- Helper: kiểm tra quyền xem / thao tác với post ----------
async function getPostForUser(postId, user, { allowOwnerPending = false } = {}) {
  const [rows] = await pool.query(
    'SELECT post_id, user_id, status, is_deleted FROM Posts WHERE post_id = ? AND is_deleted = 0',
    [postId]
  );
  if (!rows.length) return { error: { code: 404, message: 'Bài viết không tồn tại' } };

  const post = rows[0];

  // ADMIN thấy hết
  if (user.role === 'ADMIN') return { post };

  // KEEPER:
  //  - nếu bài đã APPROVED: ai cũng xem được
  //  - nếu chưa APPROVED: chỉ chủ post mới xem/sửa nếu allowOwnerPending = true
  if (post.status === 'APPROVED') return { post };
  if (allowOwnerPending && post.user_id === user.user_id) return { post };

  return {
    error: {
      code: 403,
      message: 'Bạn không có quyền truy cập bài viết này'
    }
  };
}

// ===================================================================
//  📝 1. Tạo bài viết (chủ trại hoặc admin) – luôn ở trạng thái PENDING
// ===================================================================
router.post(
  '/',
  auth,
  authorize('ADMIN', 'KEEPER'),
  async (req, res) => {
    try {
      const { content, image_url, images } = req.body;
      const { user_id } = req.user;

      if (!content || !content.trim()) {
        return res.status(400).json({ message: 'Nội dung bài viết không được trống' });
      }

      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();

        // Bài viết chính
        const [r] = await conn.query(
          `INSERT INTO Posts (user_id, content, image_url, status, created_at, is_deleted)
           VALUES (?, ?, ?, 'PENDING', NOW(), 0)`,
          [user_id, content.trim(), image_url || null]
        );
        const postId = r.insertId;

        // Nếu client gửi nhiều ảnh (mảng URL) → lưu vào PostImages
        if (Array.isArray(images) && images.length > 0) {
          const values = images
            .filter((u) => !!u)
            .map((u) => [postId, u]);

          if (values.length) {
            await conn.query(
              `INSERT INTO PostImages (post_id, image_url) VALUES ?`,
              [values]
            );
          }
        }

        await conn.commit();

        res.status(201).json({
          success: true,
          message: 'Tạo bài viết thành công, đang chờ admin duyệt',
          post_id: postId,
        });
      } catch (e) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }
    } catch (e) {
      console.error('POST /posts', e);
      res.status(500).json({ message: 'Lỗi server' });
    }
  }
);

// ===================================================================
//  📰 2. Lấy danh sách bài viết (feed cộng đồng)
//     - ADMIN: thấy tất cả, có thể filter theo status
//     - KEEPER:
//         + mặc định: thấy bài APPROVED của mọi người + bài của chính mình
//         + nếu ?mine=1: chỉ thấy bài của chính mình (với đủ status)
// ===================================================================
router.get(
  '/',
  auth,
  authorize('ADMIN', 'KEEPER'),
  async (req, res) => {
    try {
      const { role, user_id } = req.user;
      const page = Math.max(Number(req.query.page) || 1, 1);
      const pageSize = Math.min(Math.max(Number(req.query.page_size) || 20, 1), 100);
      const offset = (page - 1) * pageSize;

      const mine = req.query.mine === '1';
      const search = (req.query.search || '').trim();
      const statusFilter = (req.query.status || '').trim(); // cho ADMIN

      const whereParts = ['p.is_deleted = 0'];
      const params = [];

      if (role === 'ADMIN') {
        if (statusFilter) {
          whereParts.push('p.status = ?');
          params.push(statusFilter);
        }
      } else {
        // KEEPER
        if (mine) {
          // chỉ bài của chính mình (mọi trạng thái)
          whereParts.push('p.user_id = ?');
          params.push(user_id);
        } else {
          // feed cộng đồng: chỉ bài đã được duyệt
          whereParts.push('p.status = "APPROVED"');
        }
      }

      if (search) {
        whereParts.push('p.content LIKE ?');
        params.push(`%${search}%`);
      }

      const where = 'WHERE ' + whereParts.join(' AND ');

      // cần user_id thêm ở cuối cho cột "liked"
      const paramsWithLiked = [...params, user_id, pageSize, offset];

      const sqlData = `
        SELECT
          p.post_id,
          p.user_id,
          p.content,
          p.image_url,
          p.status,
          p.created_at,
          p.updated_at,
          u.full_name  AS author_name,
          u.username   AS author_username,
          up.avatar    AS author_avatar,
          (SELECT COUNT(*) FROM PostComments c
            WHERE c.post_id = p.post_id AND c.is_deleted = 0) AS comment_count,
          (SELECT COUNT(*) FROM PostLikes l
            WHERE l.post_id = p.post_id) AS like_count,
          (SELECT COUNT(*) FROM PostShares s
            WHERE s.post_id = p.post_id) AS share_count,
          EXISTS (
            SELECT 1 FROM PostLikes l
             WHERE l.post_id = p.post_id AND l.user_id = ?
          ) AS liked
        FROM Posts p
        JOIN Users u ON u.user_id = p.user_id
        LEFT JOIN UserProfiles up ON up.user_id = u.user_id
        ${where}
        ORDER BY p.created_at DESC
        LIMIT ? OFFSET ?`;

      const sqlCount = `SELECT COUNT(*) AS total FROM Posts p ${where}`;

      const [rows] = await pool.query(sqlData, paramsWithLiked);
      const [cnt] = await pool.query(sqlCount, params);

      res.json({
        success: true,
        data: rows,
        pagination: {
          page,
          page_size: pageSize,
          total: cnt[0].total,
        },
      });
    } catch (e) {
      console.error('GET /posts', e);
      res.status(500).json({ message: 'Lỗi server' });
    }
  }
);

// ===================================================================
//  🧾 3. Chi tiết 1 bài viết
// ===================================================================
router.get(
  '/:id',
  auth,
  authorize('ADMIN', 'KEEPER'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { user } = req;

      const check = await getPostForUser(id, user, { allowOwnerPending: true });
      if (check.error) {
        return res.status(check.error.code).json({ message: check.error.message });
      }

      const [rows] = await pool.query(
        `SELECT
           p.*,
           u.full_name  AS author_name,
           u.username   AS author_username,
           up.avatar    AS author_avatar
         FROM Posts p
         JOIN Users u ON u.user_id = p.user_id
         LEFT JOIN UserProfiles up ON up.user_id = u.user_id
         WHERE p.post_id = ?`,
        [id]
      );

      if (!rows.length) {
        return res.status(404).json({ message: 'Bài viết không tồn tại' });
      }

      res.json({ success: true, data: rows[0] });
    } catch (e) {
      console.error('GET /posts/:id', e);
      res.status(500).json({ message: 'Lỗi server' });
    }
  }
);

// ===================================================================
//  ✏️ 4. Sửa / xoá bài viết – chỉ chủ bài viết hoặc ADMIN
// ===================================================================
router.put(
  '/:id',
  auth,
  authorize('ADMIN', 'KEEPER'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { user } = req;

      const check = await getPostForUser(id, user, { allowOwnerPending: true });
      if (check.error) {
        return res.status(check.error.code).json({ message: check.error.message });
      }
      const post = check.post;

      if (user.role !== 'ADMIN' && post.user_id !== user.user_id) {
        return res.status(403).json({ message: 'Bạn không có quyền sửa bài viết này' });
      }

      const { content, image_url } = req.body;
      const fields = [];
      const params = [];

      if (content !== undefined) {
        fields.push('content = ?');
        params.push(content);
      }
      if (image_url !== undefined) {
        fields.push('image_url = ?');
        params.push(image_url);
      }

      if (!fields.length) return res.json({ success: true });

      params.push(id);

      await pool.query(
        `UPDATE Posts SET ${fields.join(', ')}, updated_at = NOW() WHERE post_id = ?`,
        params
      );

      res.json({ success: true, message: 'Cập nhật bài viết thành công' });
    } catch (e) {
      console.error('PUT /posts/:id', e);
      res.status(500).json({ message: 'Lỗi server' });
    }
  }
);

router.delete(
  '/:id',
  auth,
  authorize('ADMIN', 'KEEPER'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { user } = req;

      const check = await getPostForUser(id, user, { allowOwnerPending: true });
      if (check.error) {
        return res.status(check.error.code).json({ message: check.error.message });
      }
      const post = check.post;

      if (user.role !== 'ADMIN' && post.user_id !== user.user_id) {
        return res.status(403).json({ message: 'Bạn không có quyền xoá bài viết này' });
      }

      await pool.query(
        'UPDATE Posts SET is_deleted = 1, updated_at = NOW() WHERE post_id = ?',
        [id]
      );

      res.json({ success: true, message: 'Xoá bài viết thành công' });
    } catch (e) {
      console.error('DELETE /posts/:id', e);
      res.status(500).json({ message: 'Lỗi server' });
    }
  }
);

// ===================================================================
//  💬 5. Comment
// ===================================================================
router.get(
  '/:id/comments',
  auth,
  authorize('ADMIN', 'KEEPER'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { user } = req;

      const check = await getPostForUser(id, user, { allowOwnerPending: true });
      if (check.error) {
        return res.status(check.error.code).json({ message: check.error.message });
      }

      const page = Math.max(Number(req.query.page) || 1, 1);
      const pageSize = Math.min(Math.max(Number(req.query.page_size) || 50, 1), 100);
      const offset = (page - 1) * pageSize;

      // const [rows] = await pool.query(
      //   `SELECT
      //      c.comment_id,
      //      c.comment,
      //      c.created_at,
      //      c.updated_at,
      //      u.user_id,
      //      u.full_name  AS author_name,
      //      u.username   AS author_username,
      //      up.avatar    AS author_avatar
      //    FROM PostComments c
      //    JOIN Users u ON u.user_id = c.user_id
      //    LEFT JOIN UserProfiles up ON up.user_id = u.user_id
      //    WHERE c.post_id = ? AND c.is_deleted = 0
      //    ORDER BY c.created_at ASC
      //    LIMIT ? OFFSET ?`,
      //   [id, pageSize, offset]
      // );
const [rows] = await pool.query(
  `SELECT
     c.comment_id,
     c.comment,
     c.parent_id,
     c.created_at,
     c.updated_at,
     u.user_id,
     u.full_name  AS author_name,
     u.username   AS author_username,
     up.avatar    AS author_avatar
   FROM PostComments c
   JOIN Users u ON u.user_id = c.user_id
   LEFT JOIN UserProfiles up ON up.user_id = u.user_id
   WHERE c.post_id = ? AND c.is_deleted = 0
   ORDER BY c.created_at ASC
   LIMIT ? OFFSET ?`,
  [id, pageSize, offset]
);
      res.json({ success: true, data: rows });
    } catch (e) {
      console.error('GET /posts/:id/comments', e);
      res.status(500).json({ message: 'Lỗi server' });
    }
  }
);

router.post(
  '/:id/comments',
  auth,
  authorize('ADMIN', 'KEEPER'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { user } = req;
      const { comment } = req.body;

      if (!comment || !comment.trim()) {
        return res.status(400).json({ message: 'Nội dung bình luận không được trống' });
      }

      const check = await getPostForUser(id, user, { allowOwnerPending: false });
      if (check.error) {
        return res.status(check.error.code).json({ message: check.error.message });
      }
      // chỉ cho comment trên bài đã APPROVED hoặc admin/owner, ở trên đã check

      await pool.query(
        `INSERT INTO PostComments (post_id, user_id, comment, created_at, is_deleted)
         VALUES (?, ?, ?, NOW(), 0)`,
        [id, user.user_id, comment.trim()]
      );

      res.status(201).json({ success: true, message: 'Đã thêm bình luận' });
    } catch (e) {
      console.error('POST /posts/:id/comments', e);
      res.status(500).json({ message: 'Lỗi server' });
    }
  }
);

// ===================================================================
//  ❤️ 6. Like / Unlike (toggle)
// ===================================================================
router.post(
  '/:id/like',
  auth,
  authorize('ADMIN', 'KEEPER'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { user } = req;

      const check = await getPostForUser(id, user, { allowOwnerPending: false });
      if (check.error) {
        return res.status(check.error.code).json({ message: check.error.message });
      }

      const [rows] = await pool.query(
        `SELECT like_id FROM PostLikes WHERE post_id = ? AND user_id = ?`,
        [id, user.user_id]
      );

      if (rows.length) {
        await pool.query(
          `DELETE FROM PostLikes WHERE like_id = ?`,
          [rows[0].like_id]
        );
        return res.json({ success: true, liked: false });
      }

      await pool.query(
        `INSERT INTO PostLikes (post_id, user_id, created_at)
         VALUES (?, ?, NOW())`,
        [id, user.user_id]
      );

      res.json({ success: true, liked: true });
    } catch (e) {
      console.error('POST /posts/:id/like', e);
      res.status(500).json({ message: 'Lỗi server' });
    }
  }
);

// ===================================================================
//  📤 7. Share (ghi log số lần share)
// ===================================================================
router.post(
  '/:id/share',
  auth,
  authorize('ADMIN', 'KEEPER'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { user } = req;

      const check = await getPostForUser(id, user, { allowOwnerPending: false });
      if (check.error) {
        return res.status(check.error.code).json({ message: check.error.message });
      }

      await pool.query(
        `INSERT INTO PostShares (post_id, user_id, created_at)
         VALUES (?, ?, NOW())`,
        [id, user.user_id]
      );

      res.json({ success: true, message: 'Đã ghi nhận lượt chia sẻ' });
    } catch (e) {
      console.error('POST /posts/:id/share', e);
      res.status(500).json({ message: 'Lỗi server' });
    }
  }
);

// ===================================================================
//  ✅ 8. Admin duyệt / từ chối bài viết
// ===================================================================
router.get(
  '/admin/pending',
  auth,
  authorize('ADMIN'),
  async (req, res) => {
    try {
      const [rows] = await pool.query(
        `SELECT
           p.post_id,
           p.user_id,
           p.content,
           p.image_url,
           p.status,
           p.created_at,
           u.full_name AS author_name,
           u.username  AS author_username
         FROM Posts p
         JOIN Users u ON u.user_id = p.user_id
         WHERE p.is_deleted = 0 AND p.status = 'PENDING'
         ORDER BY p.created_at ASC`
      );
      res.json({ success: true, data: rows });
    } catch (e) {
      console.error('GET /posts/admin/pending', e);
      res.status(500).json({ message: 'Lỗi server' });
    }
  }
);

router.get(
  '/:id/engagements',
  auth,
  authorize('ADMIN', 'KEEPER'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { user } = req;

      // kiểm tra tồn tại bài viết & lấy trạng thái + chủ bài
      const [postRows] = await pool.query(
        'SELECT post_id, user_id, status, is_deleted FROM Posts WHERE post_id = ? AND is_deleted = 0',
        [id]
      );
      if (!postRows.length) {
        return res.status(404).json({ message: 'Bài viết không tồn tại' });
      }
      const post = postRows[0];

      // Chỉ cho xem nếu:
      //  - bài đã APPROVED
      //  - hoặc user là ADMIN
      //  - hoặc user là chủ bài (owner) — tùy business, mình cho phép owner xem luôn
      if (
        post.status !== 'APPROVED' &&
        user.role !== 'ADMIN' &&
        post.user_id !== user.user_id
      ) {
        return res.status(403).json({ message: 'Bạn không có quyền truy cập dữ liệu này' });
      }

      // pagination cho likes
      const likesPage = Math.max(Number(req.query.likes_page) || 1, 1);
      const likesPageSize = Math.min(Math.max(Number(req.query.likes_page_size) || 50, 1), 500);
      const likesOffset = (likesPage - 1) * likesPageSize;

      // pagination cho comments
      const commentsPage = Math.max(Number(req.query.comments_page) || 1, 1);
      const commentsPageSize = Math.min(Math.max(Number(req.query.comments_page_size) || 50, 1), 500);
      const commentsOffset = (commentsPage - 1) * commentsPageSize;

      // Lấy danh sách likes kèm thông tin user
      const [likes] = await pool.query(
        `SELECT
           l.like_id,
           l.user_id,
           u.full_name AS author_name,
           u.username  AS author_username,
           up.avatar   AS author_avatar,
           l.created_at
         FROM PostLikes l
         JOIN Users u ON u.user_id = l.user_id
         LEFT JOIN UserProfiles up ON up.user_id = u.user_id
         WHERE l.post_id = ?
         ORDER BY l.created_at DESC
         LIMIT ? OFFSET ?`,
        [id, likesPageSize, likesOffset]
      );

      const [likesCountRows] = await pool.query(
        `SELECT COUNT(*) AS total FROM PostLikes WHERE post_id = ?`,
        [id]
      );
      const likesTotal = likesCountRows[0]?.total || 0;

      // Lấy danh sách comments kèm thông tin user
      // const [comments] = await pool.query(
      //   `SELECT
      //      c.comment_id,
      //      c.user_id,
      //      c.comment,
      //      c.created_at,
      //      c.updated_at,
      //      u.full_name  AS author_name,
      //      u.username   AS author_username,
      //      up.avatar    AS author_avatar
      //    FROM PostComments c
      //    JOIN Users u ON u.user_id = c.user_id
      //    LEFT JOIN UserProfiles up ON up.user_id = u.user_id
      //    WHERE c.post_id = ? AND c.is_deleted = 0
      //    ORDER BY c.created_at ASC
      //    LIMIT ? OFFSET ?`,
      //   [id, commentsPageSize, commentsOffset]
      // );

      // Lấy danh sách comments kèm thông tin user
const [comments] = await pool.query(
  `SELECT
     c.comment_id,
     c.user_id,
     c.comment,
     c.parent_id,
     c.created_at,
     c.updated_at,
     u.full_name  AS author_name,
     u.username   AS author_username,
     up.avatar    AS author_avatar
   FROM PostComments c
   JOIN Users u ON u.user_id = c.user_id
   LEFT JOIN UserProfiles up ON up.user_id = u.user_id
   WHERE c.post_id = ? AND c.is_deleted = 0
   ORDER BY c.created_at ASC
   LIMIT ? OFFSET ?`,
  [id, commentsPageSize, commentsOffset]
);

      const [commentsCountRows] = await pool.query(
        `SELECT COUNT(*) AS total FROM PostComments WHERE post_id = ? AND is_deleted = 0`,
        [id]
      );
      const commentsTotal = commentsCountRows[0]?.total || 0;

      res.json({
        success: true,
        data: {
          post_id: Number(id),
          likes: {
            total: likesTotal,
            page: likesPage,
            page_size: likesPageSize,
            items: likes,
          },
          comments: {
            total: commentsTotal,
            page: commentsPage,
            page_size: commentsPageSize,
            items: comments,
          }
        }
      });
    } catch (e) {
      console.error('GET /posts/:id/engagements', e);
      res.status(500).json({ message: 'Lỗi server' });
    }
  }
);

router.put(
  '/:id/approve',
  auth,
  authorize('ADMIN'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { user_id } = req.user;

      const [r] = await pool.query(
        `UPDATE Posts
           SET status = 'APPROVED',
               approved_at = NOW(),
               approved_by = ?
         WHERE post_id = ?
           AND is_deleted = 0
           AND status = 'PENDING'`,          // 🔴 chỉ duyệt khi đang PENDING
        [user_id, id]
      );

      if (!r.affectedRows) {
        return res
          .status(400)
          .json({ message: 'Bài viết đã được duyệt hoặc từ chối trước đó' });
      }

      res.json({ success: true, message: 'Đã duyệt bài viết' });
    } catch (e) {
      console.error('PUT /posts/:id/approve', e);
      res.status(500).json({ message: 'Lỗi server' });
    }
  }
);


router.put(
  '/:id/reject',
  auth,
  authorize('ADMIN'),
  async (req, res) => {
    try {
      const { id } = req.params;

      const [r] = await pool.query(
        `UPDATE Posts
           SET status = 'REJECTED',
               approved_at = NOW(),
               approved_by = ?
         WHERE post_id = ?
           AND is_deleted = 0
           AND status = 'PENDING'`,          // 🔴 chỉ từ chối khi đang PENDING
        [req.user.user_id, id]
      );

      if (!r.affectedRows) {
        return res
          .status(400)
          .json({ message: 'Bài viết đã được duyệt hoặc từ chối trước đó' });
      }

      res.json({ success: true, message: 'Đã từ chối bài viết' });
    } catch (e) {
      console.error('PUT /posts/:id/reject', e);
      res.status(500).json({ message: 'Lỗi server' });
    }
  }
);

// ========================
// 9. API SỬA BÌNH LUẬN
// ========================
router.put("/:post_id/comments/:comment_id", auth, async (req, res) => {
  try {
    const { post_id, comment_id } = req.params;
    const { comment } = req.body;

    // 0. Kiểm tra dữ liệu
    if (!comment || comment.trim() === "") {
      return res.status(400).json({ message: "Nội dung bình luận không được để trống" });
    }

    // 1. Kiểm tra bài viết có tồn tại
    const [post] = await pool.query(
      "SELECT * FROM Posts WHERE post_id = ? AND is_deleted = 0",
      [post_id]
    );

    if (post.length === 0) {
      return res.status(404).json({ message: "Bài viết không tồn tại" });
    }

    // 2. Kiểm tra bình luận có tồn tại
    const [cmt] = await pool.query(
      "SELECT * FROM PostComments WHERE comment_id = ? AND post_id = ?",
      [comment_id, post_id]
    );

    if (cmt.length === 0 || cmt[0].is_deleted === 1) {
      return res.status(404).json({ message: "Bình luận không tồn tại" });
    }

    // 3. Kiểm tra quyền sửa bình luận
    const isOwner = cmt[0].user_id === req.user.user_id;
    const isAdmin = req.user.role === "ADMIN"; // Admin được quyền sửa tất cả

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: "Bạn không có quyền sửa bình luận này" });
    }

    // 4. Thực hiện UPDATE
    await pool.query(
      `UPDATE PostComments 
       SET comment = ?, updated_at = NOW() 
       WHERE comment_id = ?`,
      [comment, comment_id]
    );

    return res.json({ message: "Đã Sửa bình luận" });

  } catch (error) {
    console.error("PUT /comments error:", error);
    res.status(500).json({ message: "Lỗi server" });
  }
});

// ========================
// 10. API TRẢ LỜI BÌNH LUẬN
// ========================
router.post("/:post_id/comments/:comment_id/reply", auth, async (req, res) => {
  try {
    const { post_id, comment_id } = req.params;
    const { comment } = req.body;

    // 0. Kiểm tra dữ liệu
    if (!comment || comment.trim() === "") {
      return res.status(400).json({ message: "Nội dung trả lời không được để trống" });
    }

    // 1. Kiểm tra bài viết có tồn tại
    const [post] = await pool.query(
      "SELECT * FROM Posts WHERE post_id = ? AND is_deleted = 0",
      [post_id]
    );

    if (post.length === 0) {
      return res.status(404).json({ message: "Bài viết không tồn tại" });
    }

    // 2. Kiểm tra comment cha có tồn tại
    const [parent] = await pool.query(
      "SELECT * FROM PostComments WHERE comment_id = ? AND post_id = ? AND is_deleted = 0",
      [comment_id, post_id]
    );

    if (parent.length === 0) {
      return res.status(404).json({ message: "Bình luận gốc không tồn tại" });
    }

    // 3. Lưu trả lời (reply) vào DB — parent_id chính là comment cha
    const [result] = await pool.query(
      `INSERT INTO PostComments (post_id, user_id, comment, parent_id, created_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [post_id, req.user.user_id, comment, comment_id]
    );

    return res.json({
      message: "Trả lời bình luận thành công",
      reply_id: result.insertId,
    });

  } catch (error) {
    console.error("Reply comment error:", error);
    res.status(500).json({ message: "Lỗi server" });
  }
});

// ========================
// 11. API XÓA BÌNH LUẬN
// ========================
router.delete("/:post_id/comments/:comment_id", auth, async (req, res) => {
  try {
    const { post_id, comment_id } = req.params;

    // 1. Kiểm tra bài viết
    const [post] = await pool.query(
      "SELECT * FROM Posts WHERE post_id = ? AND is_deleted = 0",
      [post_id]
    );

    if (post.length === 0) {
      return res.status(404).json({ message: "Bài viết không tồn tại" });
    }

    // 2. Kiểm tra bình luận
    const [cmt] = await pool.query(
      "SELECT * FROM PostComments WHERE comment_id = ? AND post_id = ?",
      [comment_id, post_id]
    );

    if (cmt.length === 0 || cmt[0].is_deleted === 1) {
      return res.status(404).json({ message: "Bình luận không tồn tại" });
    }

    // 3. Kiểm tra quyền (chủ bình luận hoặc ADMIN)
    if (req.user.role !== "ADMIN" && cmt[0].user_id !== req.user.user_id) {
      return res.status(403).json({ message: "Bạn không có quyền xóa bình luận này" });
    }

    // 4. Thực hiện xóa mềm
    await pool.query(
      `UPDATE PostComments
       SET is_deleted = 1, updated_at = NOW()
       WHERE comment_id = ?`,
      [comment_id]
    );

    return res.json({ success: true, message: "Xóa bình luận thành công" });

  } catch (error) {
    console.error("DELETE comment error:", error);
    res.status(500).json({ message: "Lỗi server" });
  }
});


module.exports = router;
