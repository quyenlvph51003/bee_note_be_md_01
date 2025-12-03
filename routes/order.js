/**
 * VNPay Integration Full & Clean
 * Support: Package PRO (Monthly / Yearly) & Normal Order
 * Author: ChatGPT rebuild + log vnpay_transactions + order
 */

const express = require("express");
const router = express.Router();
const moment = require("moment");
const crypto = require("crypto");
const querystring = require("qs");
const config = require("config");
const { pool } = require("../config/db");   // mysql2/promise

// ================== PRO PACKAGES ==================
const PRO_MONTHLY = {
    price: 49000,
    days: 30
};

const PRO_YEARLY = {
    price: 499000,
    days: 365
};

// ================== HELPER ==================
function sortObject(obj) {
    const sorted = {};
    const keys = Object.keys(obj).map(k => encodeURIComponent(k)).sort();
    keys.forEach(key => {
        sorted[key] = encodeURIComponent(obj[key]).replace(/%20/g, "+");
    });
    return sorted;
}

// =====================================================
// 1. TẠO URL THANH TOÁN GÓI PRO (Monthly / Yearly)
//  - Log vào vnpay_transactions (pending)
// =====================================================
router.post("/create_pro_payment_url", async (req, res) => {
    process.env.TZ = "Asia/Ho_Chi_Minh";

    const { userId, packageType } = req.body;  
    // packageType = "monthly" | "yearly"

    if (!userId) return res.json({ status: false, message: "Thiếu userId" });
    if (!packageType) return res.json({ status: false, message: "Thiếu packageType" });

    let selectedPackage;
    if (packageType === "monthly") selectedPackage = PRO_MONTHLY;
    else if (packageType === "yearly") selectedPackage = PRO_YEARLY;
    else return res.json({ status: false, message: "packageType không hợp lệ" });

    const tmnCode = config.get("vnp_TmnCode");
    const secretKey = config.get("vnp_HashSecret");
    let vnpUrl = config.get("vnp_Url");
    const returnUrl = config.get("vnp_ReturnUrl");

    const date = new Date();
    const createDate = moment(date).format("YYYYMMDDHHmmss");
    const ipAddr = req.ip;

    // orderId: SUB_userId_monthly_timestamp
    const orderId = `SUB_${userId}_${packageType}_${moment().format("YYYYMMDDHHmmss")}`;

    // 1) LƯU TRANSACTION PENDING
    try {
        await pool.query(
            `INSERT INTO vnpay_transactions 
                (user_id, order_id, amount, type, status)
             VALUES (?, ?, ?, ?, 'pending')`,
            [
                userId,
                orderId,
                selectedPackage.price,
                packageType === "monthly" ? "pro_monthly" : "pro_yearly"
            ]
        );
    } catch (err) {
        console.error("🔥 CREATE VNPAY TRANSACTION (PRO) ERROR:", err);
        // có thể return lỗi nếu muốn chặn thanh toán
        // return res.json({ status: false, message: "Lỗi tạo giao dịch PRO" });
    }

    // 2) TẠO URL THANH TOÁN VNPay
    let vnp_Params = {
        vnp_Version: "2.1.0",
        vnp_Command: "pay",
        vnp_TmnCode: tmnCode,
        vnp_Locale: "vn",
        vnp_CurrCode: "VND",
        vnp_TxnRef: orderId,
        vnp_OrderInfo: `Thanh toán gói PRO ${packageType} cho user: ${userId}`,
        vnp_OrderType: "billpayment",
        vnp_Amount: selectedPackage.price * 100,
        vnp_ReturnUrl: returnUrl,
        vnp_IpAddr: ipAddr,
        vnp_CreateDate: createDate
    };

    vnp_Params = sortObject(vnp_Params);
    const signData = querystring.stringify(vnp_Params, { encode: false });

    const signed = crypto.createHmac("sha512", secretKey)
        .update(Buffer.from(signData, "utf-8"))
        .digest("hex");

    vnp_Params["vnp_SecureHash"] = signed;
    vnpUrl += "?" + querystring.stringify(vnp_Params, { encode: false });

    return res.json({ status: true, payment_url: vnpUrl });
});

// =====================================================
// 2. TẠO URL THANH TOÁN ĐƠN HÀNG (ORDER)
//  - Lưu vào bảng order (pending)
//  - Log vào vnpay_transactions (pending)
// =====================================================
router.post("/create_payment_url", async (req, res) => {
    process.env.TZ = "Asia/Ho_Chi_Minh";

    const { orderId, amount, bankCode, userId } = req.body;

    if (!orderId) return res.json({ status: false, message: "Thiếu orderId" });
    if (!amount) return res.json({ status: false, message: "Thiếu amount" });
    if (!userId) return res.json({ status: false, message: "Thiếu userId" });

    const tmnCode = config.get("vnp_TmnCode");
    const secretKey = config.get("vnp_HashSecret");
    let vnpUrl = config.get("vnp_Url");
    const returnUrl = config.get("vnp_ReturnUrl");

    const date = new Date();
    const createDate = moment(date).format("YYYYMMDDHHmmss");
    const ipAddr = req.ip;

    // 1) LƯU ĐƠN HÀNG PENDING TRONG BẢNG order
    try {
        await pool.query(
            `INSERT INTO \`order\`
                (order_id, user_id, total_price, state, payment_method)
             VALUES (?, ?, ?, 'pending', 'vnpay')`,
            [orderId, userId, amount]
        );
    } catch (err) {
        if (err.code !== "ER_DUP_ENTRY") {
            console.error("🔥 CREATE ORDER ERROR:", err);
            return res.json({ status: false, message: "Lỗi tạo đơn hàng" });
        }
        // Nếu ER_DUP_ENTRY thì cho đi tiếp (đã tồn tại)
    }

    // 2) LƯU TRANSACTION PENDING VÀO vnpay_transactions
    try {
        await pool.query(
            `INSERT INTO vnpay_transactions
                (user_id, order_id, amount, type, bank_code, status)
             VALUES (?, ?, ?, 'order', ?, 'pending')`,
            [userId, orderId, amount, bankCode || null]
        );
    } catch (err) {
        console.error("🔥 CREATE VNPAY TRANSACTION (ORDER) ERROR:", err);
        // tuỳ flow, có thể return lỗi nếu muốn chặn
        // return res.json({ status: false, message: "Lỗi tạo giao dịch" });
    }

    // 3) TẠO URL THANH TOÁN VNPay
    let vnp_Params = {
        vnp_Version: "2.1.0",
        vnp_Command: "pay",
        vnp_TmnCode: tmnCode,
        vnp_Locale: "vn",
        vnp_CurrCode: "VND",
        vnp_TxnRef: orderId,
        vnp_OrderInfo: "Thanh toán đơn hàng " + orderId,
        vnp_OrderType: "other",
        vnp_Amount: amount * 100,
        vnp_ReturnUrl: returnUrl,
        vnp_IpAddr: ipAddr,
        vnp_CreateDate: createDate
    };

    if (bankCode) vnp_Params["vnp_BankCode"] = bankCode;

    vnp_Params = sortObject(vnp_Params);
    const signData = querystring.stringify(vnp_Params, { encode: false });

    const signed = crypto.createHmac("sha512", secretKey)
        .update(Buffer.from(signData, "utf-8"))
        .digest("hex");

    vnp_Params["vnp_SecureHash"] = signed;
    vnpUrl += "?" + querystring.stringify(vnp_Params, { encode: false });

    return res.json({ status: true, payment_url: vnpUrl });
});

// =====================================================
// 3. XỬ LÝ SAU KHI THANH TOÁN (RETURN URL)
//  - Verify checksum
//  - Cập nhật vnpay_transactions: success/failed
//  - PRO: cập nhật Users
//  - ORDER: cập nhật bảng order
// =====================================================
router.get("/vnpay_return", async (req, res) => {
    try {
        if (!req.query || !req.query.vnp_TxnRef) {
            return res.redirect("/vnpay_fail.html?msg=Missing+vnp_TxnRef");
        }

        let vnp_Params = { ...req.query };
        const secureHash = vnp_Params["vnp_SecureHash"];

        delete vnp_Params["vnp_SecureHash"];
        delete vnp_Params["vnp_SecureHashType"];

        vnp_Params = sortObject(vnp_Params);

        const secretKey = config.get("vnp_HashSecret");
        const signData = querystring.stringify(vnp_Params, { encode: false });

        const signed = crypto.createHmac("sha512", secretKey)
            .update(Buffer.from(signData, "utf-8"))
            .digest("hex");

        if (secureHash !== signed) {
            return res.redirect("/vnpay_fail.html?msg=Checksum+Failed");
        }

        const orderId = req.query.vnp_TxnRef;
        const responseCode = req.query.vnp_ResponseCode;
        const bankCode = req.query.vnp_BankCode || null;
        const amount = Number(req.query.vnp_Amount || 0) / 100; // VNPay trả *100

        if (!orderId) {
            return res.redirect("/vnpay_fail.html?msg=Missing+orderId");
        }

        // 3.1) CẬP NHẬT BẢNG vnpay_transactions
        const txStatus = responseCode === "00" ? "success" : "failed";

        try {
            await pool.query(
                `UPDATE vnpay_transactions
                 SET amount = ?,
                     bank_code = ?,
                     response_code = ?,
                     status = ?
                 WHERE order_id = ? AND status = 'pending'`,
                [amount, bankCode, responseCode, txStatus, orderId]
            );
        } catch (err) {
            console.error("🔥 UPDATE VNPAY TRANSACTION ERROR:", err);
        }

        // ============================================================
        // GÓI PRO (SUB_)
// ============================================================
        if (orderId.startsWith("SUB_")) {

            const parts = orderId.split("_");
            if (parts.length < 3) {
                return res.redirect("/vnpay_fail.html?msg=Invalid+PRO+order+format");
            }

            const userId = parts[1];
            const packageType = parts[2];

            let selectedPackage = null;
            if (packageType === "monthly") selectedPackage = PRO_MONTHLY;
            if (packageType === "yearly") selectedPackage = PRO_YEARLY;

            if (!selectedPackage) {
                return res.redirect("/vnpay_fail.html?msg=Invalid+package+type");
            }

            // Thành công
            if (responseCode === "00") {
                await pool.query(
                    `UPDATE Users 
                     SET package_type = ?,
                         package_expired_at = DATE_ADD(NOW(), INTERVAL ? DAY)
                     WHERE user_id = ?`,
                    [`pro_${packageType}`, selectedPackage.days, userId]
                );

                return res.redirect(
                    `/vnpay_success.html?type=pro&package=${packageType}&user=${userId}`
                );
            }

            // Thất bại
            return res.redirect("/vnpay_fail.html?msg=Thanh+toan+PRO+that+bai");
        }

        // ============================================================
        // ĐƠN HÀNG THƯỜNG
        // ============================================================
        if (responseCode === "00") {
            // Thanh toán thành công → cập nhật state = banked
            await pool.query(
                "UPDATE `order` SET state = 'banked' WHERE order_id = ?",
                [orderId]
            );

            return res.redirect(`/vnpay_success.html?orderId=${orderId}`);
        }

        // Thanh toán thất bại → cập nhật state = failed
        await pool.query(
            "UPDATE `order` SET state = 'failed' WHERE order_id = ?",
            [orderId]
        );

        return res.redirect("/vnpay_fail.html?msg=Thanh+toan+don+hang+that+bai");

    } catch (err) {
        console.error("🔥 VNPAY RETURN ERROR:", err.message);
        return res.redirect("/vnpay_fail.html?msg=Server+Error");
    }
});

// =====================================================
// 4. IPN (Optional)
// =====================================================
router.get("/vnpay_ipn", (req, res) => {
    return res.json({ RspCode: "00", Message: "IPN ignored (demo)" });
});

// EXPORT
module.exports = router;
