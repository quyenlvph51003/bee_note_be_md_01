/**
 * VNPay Integration Full & Clean
 * Support: Package PRO & Normal Order
 * Author: ChatGPT rebuild
 */

const express = require("express");
const router = express.Router();
const moment = require("moment");
const request = require("request");
const crypto = require("crypto");
const querystring = require("qs");
const config = require("config");

const { pool } = require("../config/db");   // mysql2/promise

// Gói PRO
const PRO_PRICE = 50000;
const PRO_DURATION_DAYS = 30;

// ================== HELPER ==================
function sortObject(obj) {
    const sorted = {};
    const keys = Object.keys(obj).map(k => encodeURIComponent(k)).sort();
    keys.forEach(key => {
        sorted[key] = encodeURIComponent(obj[key]).replace(/%20/g, "+");
    });
    return sorted;
}

// ================== 1. TẠO URL THANH TOÁN GÓI PRO ==================
router.post("/create_pro_payment_url", (req, res) => {
    process.env.TZ = "Asia/Ho_Chi_Minh";

    const { userId } = req.body;
    if (!userId) return res.json({ status: false, message: "Thiếu userId" });

    const tmnCode = config.get("vnp_TmnCode");
    const secretKey = config.get("vnp_HashSecret");
    let vnpUrl = config.get("vnp_Url");
    const returnUrl = config.get("vnp_ReturnUrl");

    const date = new Date();
    const createDate = moment(date).format("YYYYMMDDHHmmss");
    const ipAddr = req.ip;

    // orderId của PRO: SUB_userId_timestamp
    const orderId = `SUB_${userId}_${moment().format("YYYYMMDDHHmmss")}`;

    let vnp_Params = {
        vnp_Version: "2.1.0",
        vnp_Command: "pay",
        vnp_TmnCode: tmnCode,
        vnp_Locale: "vn",
        vnp_CurrCode: "VND",
        vnp_TxnRef: orderId,
        vnp_OrderInfo: `Thanh toán gói PRO cho user: ${userId}`,
        vnp_OrderType: "billpayment",
        vnp_Amount: PRO_PRICE * 100,
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

// ================== 2. TẠO URL THANH TOÁN ĐƠN HÀNG ==================
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

// ================== 3. XỬ LÝ SAU KHI THANH TOÁN (VNPAY RETURN) ==================
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

    // Sai checksum → thất bại
    if (secureHash !== signed) {
        return res.json({ status: false, message: "Checksum failed" });
    }

    // Hợp lệ
    const orderId = req.query.vnp_TxnRef;
    const responseCode = req.query.vnp_ResponseCode;

    // ============= THANH TOÁN GÓI PRO =============
    if (orderId.startsWith("SUB_")) {
        const userId = orderId.split("_")[1];

        if (responseCode === "00") {
            await pool.query(
                `UPDATE Users 
                 SET package_type = 'pro',
                     package_expired_at = DATE_ADD(NOW(), INTERVAL ? DAY)
                 WHERE user_id = ?`,
                [PRO_DURATION_DAYS, userId]
            );

            return res.json({
                status: true,
                message: "Thanh toán thành công - tài khoản đã nâng cấp PRO",
                userId
            });
        }

        return res.json({
            status: false,
            message: "Thanh toán thất bại",
            userId
        });
    }

    // ============= THANH TOÁN ĐƠN HÀNG =============
    if (responseCode === "00") {
        await pool.query(
            "UPDATE `order` SET state = 'banked' WHERE order_id = ?",
            [orderId]
        );
        return res.json({ status: true, message: "Thanh toán đơn hàng thành công", orderId });
    }

    return res.json({ status: false, message: "Thanh toán đơn hàng thất bại", orderId });
});

// ================== 4. IPN (KHÔNG BẮT BUỘC) ==================
router.get("/vnpay_ipn", (req, res) => {
    return res.json({ RspCode: "00", Message: "IPN ignored (demo)" });
});

// EXPORT
module.exports = router;
