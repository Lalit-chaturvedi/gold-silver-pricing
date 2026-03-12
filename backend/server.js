// ─── Gold · Silver Tracker — OTP Backend Server (MSG91) ──────────────────────
// Run: node server.js
// Requires: npm install express cors dotenv

require("dotenv").config();
const express = require("express");
const cors    = require("cors");

const app = express();
app.use(express.json());
app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:5173" }));

// ── OTP Store ─────────────────────────────────────────────────────────────────
const otpStore     = new Map();
const OTP_EXPIRY   = 5 * 60 * 1000; // 5 minutes
const MAX_ATTEMPTS = 3;

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function cleanPhone(phone) {
  // Returns 10-digit number
  return phone.replace(/\D/g, "").slice(-10);
}

function validateIndianPhone(phone) {
  return /^[6-9]\d{9}$/.test(phone);
}

// ── Send OTP via MSG91 ────────────────────────────────────────────────────────
async function sendOtpViaMSG91(phone10digit, otp) {
  const authKey    = process.env.MSG91_AUTH_KEY;
  const templateId = process.env.MSG91_TEMPLATE_ID;
  const senderId   = process.env.MSG91_SENDER_ID || "OTPSVC";

  if (!authKey) throw new Error("MSG91_AUTH_KEY not configured in .env");

  // MSG91 OTP API v5
  const url = "https://control.msg91.com/api/v5/otp";
  const payload = {
    template_id: templateId,
    mobile:      `91${phone10digit}`,
    authkey:     authKey,
    otp:         otp,
    sender:      senderId,
  };

  const res = await fetch(url, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(payload),
  });

  const data = await res.json();
  console.log("MSG91 response:", data);

  if (data.type === "error") {
    throw new Error(data.message || "MSG91 error");
  }

  return data;
}

// ── POST /api/send-otp ────────────────────────────────────────────────────────
app.post("/api/send-otp", async (req, res) => {
  const { name, phone } = req.body;

  if (!name || !phone) {
    return res.status(400).json({ success: false, message: "Name and phone are required." });
  }

  const phone10 = cleanPhone(phone);

  if (!validateIndianPhone(phone10)) {
    return res.status(400).json({ success: false, message: "Enter a valid 10-digit Indian mobile number." });
  }

  const otp       = generateOTP();
  const expiresAt = Date.now() + OTP_EXPIRY;

  // Save to store
  otpStore.set(phone10, { otp, name, expiresAt, attempts: 0 });

  try {
    await sendOtpViaMSG91(phone10, otp);
    console.log(`✅ OTP sent to +91${phone10} (${name})`);
    res.json({ success: true, message: "OTP sent successfully." });
  } catch (err) {
    console.error("❌ SMS error:", err.message);
    otpStore.delete(phone10);
    res.status(500).json({ success: false, message: `Failed to send OTP: ${err.message}` });
  }
});

// ── POST /api/verify-otp ──────────────────────────────────────────────────────
app.post("/api/verify-otp", (req, res) => {
  const { phone, otp } = req.body;

  if (!phone || !otp) {
    return res.status(400).json({ success: false, message: "Phone and OTP are required." });
  }

  const phone10 = cleanPhone(phone);
  const record  = otpStore.get(phone10);

  if (!record) {
    return res.status(400).json({ success: false, message: "OTP not found. Please request a new one." });
  }

  if (Date.now() > record.expiresAt) {
    otpStore.delete(phone10);
    return res.status(400).json({ success: false, message: "OTP expired. Please request a new one." });
  }

  if (record.attempts >= MAX_ATTEMPTS) {
    otpStore.delete(phone10);
    return res.status(429).json({ success: false, message: "Too many attempts. Please request a new OTP." });
  }

  if (record.otp !== otp.trim()) {
    record.attempts += 1;
    const left = MAX_ATTEMPTS - record.attempts;
    return res.status(400).json({
      success: false,
      message: `Incorrect OTP. ${left} attempt${left !== 1 ? "s" : ""} remaining.`,
    });
  }

  // ✅ Success
  otpStore.delete(phone10);
  console.log(`✅ Verified: ${record.name} (+91${phone10})`);

  res.json({
    success: true,
    message: "Verified successfully.",
    user: { name: record.name, phone: `+91${phone10}` },
  });
});

// ── GET /api/health ───────────────────────────────────────────────────────────
app.get("/api/health", (_, res) => res.json({
  status: "ok",
  msg91: process.env.MSG91_AUTH_KEY ? "✓ configured" : "✗ missing",
}));

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`\n🚀 OTP Server running on http://localhost:${PORT}`);
  console.log(`   MSG91 Auth Key:  ${process.env.MSG91_AUTH_KEY  ? "✓ configured" : "✗ missing"}`);
  console.log(`   MSG91 Template:  ${process.env.MSG91_TEMPLATE_ID ? "✓ configured" : "✗ missing"}`);
  console.log(`   MSG91 Sender ID: ${process.env.MSG91_SENDER_ID  ? "✓ configured" : "✗ missing"}\n`);
});