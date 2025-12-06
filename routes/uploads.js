// routes/uploads.js
const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const auth = require('../middleware/auth');

// Tạo thư mục uploads nếu chưa có
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Cấu hình multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('Chỉ chấp nhận file ảnh (jpg, png, gif, webp)'));
    }
  }
});

// POST /api/uploads
router.post('/', auth, upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Không có file ảnh được upload'
      });
    }

    // Tạo URL đầy đủ
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    const imageUrl = `${baseUrl}/uploads/${req.file.filename}`;

    res.status(201).json({
      success: true,
      message: 'Upload thành công',
      image_url: imageUrl,
      filename: req.file.filename
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi upload ảnh'
    });
  }
});

// Error handler cho multer
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File quá lớn. Tối đa 5MB'
      });
    }
  }
  res.status(400).json({
    success: false,
    message: err.message || 'Lỗi upload'
  });
});

module.exports = router;