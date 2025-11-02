// utils/jwt.js
const jwt = require('jsonwebtoken');

const createAccessToken = (payload) =>
  jwt.sign(payload, process.env.JWT_ACCESS_SECRET, {
    expiresIn: process.env.JWT_ACCESS_EXPIRES || '15m'
  });

const createRefreshToken = (payload) =>
  jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES || '30d'
  });

const verifyAccessToken = (t) => jwt.verify(t, process.env.JWT_ACCESS_SECRET);
const verifyRefreshToken = (t) => jwt.verify(t, process.env.JWT_REFRESH_SECRET);

module.exports = {
  createAccessToken,
  createRefreshToken,
  verifyAccessToken,
  verifyRefreshToken
};
