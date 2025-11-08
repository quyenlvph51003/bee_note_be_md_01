// middleware/authorize.js
module.exports = function (...allowedRoles) {
  return (req, res, next) => {
    try {
      if (!req.user)
        return res.status(401).json({ message: "Chưa xác thực người dùng" });

      const userRole = req.user.role;

      if (!allowedRoles.includes(userRole)) {
        return res.status(403).json({
          message: "Bạn không có quyền truy cập tính năng này",
        });
      }

      next();
    } catch (err) {
      console.error("Authorize error:", err);
      res.status(500).json({ message: "Lỗi khi kiểm tra quyền truy cập" });
    }
  };
};
