// config/db.js
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.SQL_SERVER, // ví dụ: 'localhost'
  user: process.env.SQL_USER,   // ví dụ: 'root'
  password: process.env.SQL_PASSWORD,
  database: process.env.SQL_DATABASE,
  port: process.env.SQL_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

pool.getConnection()
  .then(conn => {
    console.log('✅ Kết nối MySQL thành công!');
    conn.release();
  })
  .catch(err => {
    console.error('❌ Lỗi kết nối MySQL:', err.message);
    process.exit(1);
  });

async function testConnection() {
  try {
    const [rows] = await pool.query('SELECT 1 AS ok');
    console.log('🔌 DB ready:', rows[0]);
  } catch (err) {
    console.error('DB test failed:', err);
  }
}

module.exports = { pool, testConnection };
