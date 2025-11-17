// utils/notificationService.js
const { pool } = require("../config/db");
const dayjs = require("dayjs");

// mapping chu kỳ ngày
const HIVE_STATUS_CYCLE = {
  HEALTHY: 7,
  WEAK: 2,
  NEED_CHECK: 3,
  ALERT: 1
};

const QUEEN_STATUS_CYCLE = {
  PRESENT: 7,
  ABSENT: 0,
  VIRGIN: 3,
  SUPERSEDURE: 2
};

// build message
function buildMessage(hive, kind) {
  if (kind === "HIVE_STATUS") {
    switch (hive.status) {
      case "WEAK":
        return {
          title: `Tổ ${hive.hive_name} đang yếu`,
          message: `Tổ ${hive.hive_name} đang yếu, cần kiểm tra.`
        };
      case "NEED_CHECK":
        return {
          title: `Tổ ${hive.hive_name} cần kiểm tra`,
          message: `Tổ ${hive.hive_name} có dấu hiệu cần kiểm tra.`
        };
      case "ALERT":
        return {
          title: `⚠️ Cảnh báo: Tổ ${hive.hive_name}`,
          message: `Tổ ${hive.hive_name} đang ALERT. Kiểm tra ngay.`
        };
      default:
        return {
          title: `Tổ ${hive.hive_name} khỏe`,
          message: `Tổ ${hive.hive_name} đang khỏe mạnh.`
        };
    }
  }

  if (kind === "QUEEN_STATUS") {
    switch (hive.queen_status) {
      case "ABSENT":
        return {
          title: `❌ Tổ ${hive.hive_name} mất chúa`,
          message: `Tổ ${hive.hive_name} bị mất chúa — cần xử lý ngay.`
        };
      case "VIRGIN":
        return {
          title: `Chúa tơ – ${hive.hive_name}`,
          message: `Tổ ${hive.hive_name} có chúa tơ, cần theo dõi.`
        };
      case "SUPERSEDURE":
        return {
          title: `Tổ ${hive.hive_name} đang thay chúa`,
          message: `Tổ ${hive.hive_name} đang supersedure.`
        };
      default:
        return {
          title: `Chúa bình thường`,
          message: `Chúa của tổ ${hive.hive_name} ổn định.`
        };
    }
  }

  return { title: "Thông báo", message: "Thông báo từ hệ thống" };
}

// push stub
async function sendPushToUser(userId, title, message) {
  console.log(`[push] to user ${userId} => ${title} | ${message}`);
}

// create notification
async function createNotification({ hiveId, farmId, userId, title, message, type = 'HIVE_STATUS', payload }) {
  const conn = await pool.getConnection();
  try {
    await conn.execute(
      `INSERT INTO Notifications (hive_id, farm_id, user_id, title, message, type, payload)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        hiveId,
        farmId,
        userId,
        title,
        message,
        type,
        payload ? JSON.stringify(payload) : null
      ]
    );

    if (userId) {
      await sendPushToUser(userId, title, message);
    }
  } finally {
    conn.release();
  }
}

async function updateHiveLastNotify(hiveId) {
  await pool.execute(`UPDATE Hives SET last_notify_at = NOW() WHERE hive_id = ?`, [hiveId]);
}

function daysSince(dt) {
  if (!dt) return Infinity;
  return dayjs().diff(dayjs(dt), "day");
}

// main logic
async function checkHiveAndNotify(hive) {
  const hiveCycle = HIVE_STATUS_CYCLE[hive.status] ?? 7;
  const queenCycle = QUEEN_STATUS_CYCLE[hive.queen_status] ?? 7;

  const days = daysSince(hive.last_notify_at);
  const userId = await getFarmOwnerId(hive.farm_id);

  // ================================
  // 🔥 SỬA QUAN TRỌNG:
  // ABSENT chỉ gửi 1 lần duy nhất
  // ================================
  if (hive.queen_status === "ABSENT") {

    if (days < 1) {
      return; // đã gửi gần đây → KHÔNG gửi lại
    }

    const { title, message } = buildMessage(hive, "QUEEN_STATUS");

    await createNotification({
      hiveId: hive.hive_id,
      farmId: hive.farm_id,
      userId,
      title,
      message,
      type: "QUEEN_STATUS"
    });

    await updateHiveLastNotify(hive.hive_id);
    return;
  }

  // cycle gửi lại theo ngày
  if (days >= Math.min(hiveCycle, queenCycle)) {
    const m1 = buildMessage(hive, "HIVE_STATUS");
    const m2 = buildMessage(hive, "QUEEN_STATUS");

    const title = `${m1.title} | ${m2.title}`;
    const message = `${m1.message} — ${m2.message}`;

    await createNotification({
      hiveId: hive.hive_id,
      farmId: hive.farm_id,
      userId,
      title,
      message,
      type: "HIVE_STATUS"
    });

    await updateHiveLastNotify(hive.hive_id);
  }
}

// lấy owner
async function getFarmOwnerId(farmId) {
  try {
    const [rows] = await pool.execute(
      `SELECT manager_id AS user_id FROM Farms WHERE farm_id = ? LIMIT 1`,
      [farmId]
    );
    return rows.length ? rows[0].user_id : null;
  } catch (err) {
    console.warn("getFarmOwnerId error", err);
    return null;
  }
}

module.exports = {
  checkHiveAndNotify,
  createNotification,
  buildMessage
};
