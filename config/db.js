// config/db.js
const mysql = require('mysql2/promise');

// ⚠️ Đảm bảo các biến môi trường khớp với những gì bạn set trên Railway
// SQL_SERVER / SQL_USER / SQL_PASSWORD / SQL_DATABASE / SQL_PORT / DB_SSL

const pool = mysql.createPool({
  host: process.env.SQL_SERVER,
  user: process.env.SQL_USER,
  password: process.env.SQL_PASSWORD,
  database: process.env.SQL_DATABASE,
  port: Number(process.env.SQL_PORT) || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 8000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  // Bật SSL khi nhà cung cấp DB yêu cầu
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
});

// ❌ KHÔNG test/getConnection ở top-level và KHÔNG process.exit()
// Chỉ log, để server vẫn khởi động và trả lời /health

async function testConnection() {
  try {
    const conn = await pool.getConnection();
    await conn.ping();
    conn.release();
    console.log('✅ DB ready');
  } catch (err) {
    console.error('⚠️ DB connect error:', err.code || err.message);
    // Không throw/exit để app vẫn chạy
  }
}

module.exports = { pool, testConnection };
