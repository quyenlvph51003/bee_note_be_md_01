const cloudinary = require('../config/cloudinary');

const uploadToCloudinary = (buffer, folder = 'bee_note') => {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      { folder },
      (error, result) => {
        if (error) return reject(error);
        resolve(result.secure_url);
      }
    ).end(buffer);
  });
};

module.exports = uploadToCloudinary;
