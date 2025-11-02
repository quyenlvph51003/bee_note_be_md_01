// config/db.js
const sql = require('mssql');

const config = {
  server: process.env.SQL_SERVER,
  user: process.env.SQL_USER,
  password: process.env.SQL_PASSWORD,
  database: process.env.SQL_DATABASE,
  options: { encrypt: process.env.SQL_ENCRYPT === 'true', trustServerCertificate: true },
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 }
};

const poolPromise = new sql.ConnectionPool(config)
  .connect()
  .then(pool => {
    console.log('✅ Kết nối SQL Server thành công!');
    return pool;
  })
  .catch(err => {
    console.error('❌ Lỗi kết nối SQL Server:', err);
    process.exit(1);
  });

async function testConnection() {
  try {
    const pool = await poolPromise;
    await pool.request().query('SELECT 1 AS ok');
    console.log('🔌 DB ready');
  } catch (e) {
    console.error('DB test failed:', e);
  }
}

module.exports = { sql, poolPromise, testConnection };
