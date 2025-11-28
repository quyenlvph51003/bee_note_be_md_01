/**
 * VNPay Integration Full & Clean
 * Support: Package PRO (Monthly / Yearly) & Normal Order
 * Author: ChatGPT rebuild
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
// =====================================================
router.post("/create_pro_payment_url", (req, res) => {
    process.env.TZ = "Asia/Ho_Chi_Minh";

    const { userId, packageType } = req.body;  
    // packageType = "monthly" | "yearly"

    if (!userId) return res.json({ status: false, message: "Thiếu userId" });
    if (!packageType) return res.json({ status: false, message: "Thiếu packageType" });

    // Chọn gói
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
// =====================================================
router.post("/create_payment_url", (req, res) => {
    process.env.TZ = "Asia/Ho_Chi_Minh";

    const { orderId, amount, bankCode } = req.body;

    const tmnCode = config.get("vnp_TmnCode");
    const secretKey = config.get("vnp_HashSecret");
    let vnpUrl = config.get("vnp_Url");
    const returnUrl = config.get("vnp_ReturnUrl");

    const date = new Date();
    const createDate = moment(date).format("YYYYMMDDHHmmss");
    const ipAddr = req.ip;

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

    res.json({ status: true, payment_url: vnpUrl });
});

// =====================================================
// 3. XỬ LÝ SAU KHI THANH TOÁN (RETURN URL)
// =====================================================
router.get("/vnpay_return", async (req, res) => {
    let vnp_Params = req.query;

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
        return res.json({ status: false, message: "Checksum failed" });
    }

    const orderId = req.query.vnp_TxnRef;
    const responseCode = req.query.vnp_ResponseCode;

    // =====================================================
    // 3.1 XỬ LÝ THANH TOÁN GÓI PRO
    // =====================================================
    if (orderId.startsWith("SUB_")) {

        const parts = orderId.split("_");
        const userId = parts[1];
        const packageType = parts[2];  // monthly | yearly

        let selectedPackage;

        if (packageType === "monthly") selectedPackage = PRO_MONTHLY;
        else if (packageType === "yearly") selectedPackage = PRO_YEARLY;

        if (responseCode === "00") {

            await pool.query(
                `UPDATE Users 
                 SET package_type = ?,
                     package_expired_at = DATE_ADD(NOW(), INTERVAL ? DAY)
                 WHERE user_id = ?`,
                [`pro_${packageType}`, selectedPackage.days, userId]
            );

            return res.json({
                status: true,
                message: `Thanh toán thành công - gói PRO ${packageType} đã kích hoạt`,
                userId
            });
        }

        return res.json({
            status: false,
            message: "Thanh toán thất bại",
            userId
        });
    }

    // =====================================================
    // 3.2 XỬ LÝ THANH TOÁN ĐƠN HÀNG
    // =====================================================
    if (responseCode === "00") {
        await pool.query(
            "UPDATE `order` SET state = 'banked' WHERE order_id = ?",
            [orderId]
        );

        return res.json({
            status: true,
            message: "Thanh toán đơn hàng thành công",
            orderId
        });
    }

    return res.json({
        status: false,
        message: "Thanh toán đơn hàng thất bại",
        orderId
    });
});

// =====================================================
// 4. IPN (Optional)
// =====================================================
router.get("/vnpay_ipn", (req, res) => {
    return res.json({ RspCode: "00", Message: "IPN ignored (demo)" });
});

// EXPORT
module.exports = router;
