const multer = require('multer');

// dùng memoryStorage để upload buffer lên Cloudinary
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      cb(new Error('Chỉ cho phép upload ảnh'), false);
    } else {
      cb(null, true);
    }
  }
});

module.exports = upload;
