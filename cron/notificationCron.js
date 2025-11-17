// cron/notificationCron.js
const cron = require("node-cron");
const { pool } = require("../config/db");
const { checkHiveAndNotify } = require("../utils/notificationService");
require('dotenv').config();

const CRON_TIME = process.env.CRON_TIME || "0 7 * * *"; // default mỗi ngày 07:00

function startNotificationCron() {
  console.log(`[cron] scheduling notification cron: ${CRON_TIME}`);
  cron.schedule(CRON_TIME, async () => {
    console.log("[cron] start daily hive check:", new Date().toLocaleString());
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.execute(`SELECT * FROM Hives WHERE is_deleted = 0`);
      for (const hive of rows) {
        try {
          await checkHiveAndNotify(hive);
        } catch (err) {
          console.error("checkHiveAndNotify error for hive", hive.hive_id, err);
        }
      }
    } finally {
      conn.release();
    }
    console.log("[cron] finished daily check");
  }, {
    timezone: process.env.CRON_TZ || "Asia/Ho_Chi_Minh"
  });
}

module.exports = { startNotificationCron };
