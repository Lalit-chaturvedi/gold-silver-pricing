// ─── Gold · Silver Tracker — OTP Backend Server ──────────────────────────────
// Run: node server.js
// Requires: npm install express twilio cors dotenv exceljs axios

require("dotenv").config();
const express  = require("express");
const cors     = require("cors");
const twilio   = require("twilio");
const ExcelJS  = require("exceljs");
const path     = require("path");
const fs       = require("fs");
const https    = require("https");

const app = express();
app.use(express.json());
app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:5173" }));

// ── Twilio Client ─────────────────────────────────────────────────────────────
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// ── OTP Store ─────────────────────────────────────────────────────────────────
const otpStore     = new Map();
const OTP_EXPIRY   = 5 * 60 * 1000; // 5 minutes
const MAX_ATTEMPTS = 3;

// ── Excel File Setup ──────────────────────────────────────────────────────────
const EXCEL_PATH = path.join(process.cwd(), "users.xlsx");

async function getWorkbook() {
  const wb = new ExcelJS.Workbook();

  if (fs.existsSync(EXCEL_PATH)) {
    await wb.xlsx.readFile(EXCEL_PATH);
  }

  let ws = wb.getWorksheet("Users");
  if (!ws) {
    ws = wb.addWorksheet("Users");
    ws.columns = [
      { header: "Name",        key: "name",        width: 25 },
      { header: "Mobile",      key: "mobile",      width: 18 },
      { header: "First Login", key: "firstLogin",  width: 22 },
      { header: "Last Login",  key: "lastLogin",   width: 22 },
      { header: "Login Count", key: "loginCount",  width: 14 },
    ];
    ws.getRow(1).font      = { bold: true, color: { argb: "FFFFFFFF" } };
    ws.getRow(1).fill      = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1A1A2E" } };
    ws.getRow(1).alignment = { horizontal: "center" };
    await wb.xlsx.writeFile(EXCEL_PATH);
  }

  return { wb, ws };
}

// ── Save or update user in Excel (unique by mobile) ───────────────────────────
async function upsertUser(name, phone10) {
  const { wb, ws } = await getWorkbook();
  const mobile     = `+91${phone10}`;
  const now        = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

  let found = false;

  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    if (String(row.getCell("mobile").value) === mobile) {
      row.getCell("lastLogin").value  = now;
      row.getCell("loginCount").value = (row.getCell("loginCount").value || 0) + 1;
      found = true;
    }
  });

  if (!found) {
    ws.addRow({ name, mobile, firstLogin: now, lastLogin: now, loginCount: 1 });
    console.log(`📋 New user saved: ${name} (${mobile})`);
  } else {
    console.log(`📋 Login updated: ${mobile}`);
  }

  await wb.xlsx.writeFile(EXCEL_PATH);
  console.log(`📁 Excel saved at: ${EXCEL_PATH}`);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function cleanPhone(phone) {
  return phone.replace(/\D/g, "").slice(-10);
}

function validateIndianPhone(phone) {
  return /^[6-9]\d{9}$/.test(phone);
}

// ── Send OTP via Twilio ───────────────────────────────────────────────────────
async function sendOtp(phone10, otp) {
  await twilioClient.messages.create({
    body: `Your Gold Silver Tracker OTP is: ${otp}. Valid for 5 minutes. Do not share.`,
    from: process.env.TWILIO_PHONE_NUMBER,
    to:   `+91${phone10}`,
  });
}

// ── POST /api/send-otp ────────────────────────────────────────────────────────
app.post("/api/send-otp", async (req, res) => {
  const { name, phone } = req.body;

  if (!name || !phone)
    return res.status(400).json({ success: false, message: "Name and phone are required." });

  const phone10 = cleanPhone(phone);

  if (!validateIndianPhone(phone10))
    return res.status(400).json({ success: false, message: "Enter a valid 10-digit Indian mobile number." });

  const otp       = generateOTP();
  const expiresAt = Date.now() + OTP_EXPIRY;

  otpStore.set(phone10, { otp, name, expiresAt, attempts: 0 });

  try {
    await sendOtp(phone10, otp);
    console.log(`✅ OTP sent to +91${phone10} (${name})`);
    res.json({ success: true, message: "OTP sent successfully." });
  } catch (err) {
    console.error("❌ Twilio error:", err.message);
    otpStore.delete(phone10);
    res.status(500).json({ success: false, message: "Failed to send OTP. Please try again." });
  }
});

// ── POST /api/verify-otp ──────────────────────────────────────────────────────
app.post("/api/verify-otp", async (req, res) => {
  const { phone, otp } = req.body;

  if (!phone || !otp)
    return res.status(400).json({ success: false, message: "Phone and OTP are required." });

  const phone10 = cleanPhone(phone);
  const record  = otpStore.get(phone10);

  if (!record)
    return res.status(400).json({ success: false, message: "OTP not found. Please request a new one." });

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

  // ✅ Verified
  otpStore.delete(phone10);

  try {
    await upsertUser(record.name, phone10);
  } catch (err) {
    console.error("❌ Excel error:", err.message);
  }

  console.log(`✅ Verified: ${record.name} (+91${phone10})`);

  res.json({
    success: true,
    message: "Verified successfully.",
    user:    { name: record.name, phone: `+91${phone10}` },
  });
});

// ── 5paisa helper — raw HTTPS POST (no axios needed) ─────────────────────────
function fivePaisaPost(apiPath, payload, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(payload);
    const options = {
      hostname: "Openapi.5paisa.com",
      path:     apiPath,
      method:   "POST",
      headers:  {
        "Content-Type":   "application/json",
        "Content-Length": Buffer.byteLength(bodyStr),
        ...extraHeaders,
      },
    };
    const req = https.request(options, (resp) => {
      let data = "";
      resp.on("data", c => data += c);
      resp.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error("Invalid JSON from 5paisa")); }
      });
    });
    req.on("error", reject);
    req.write(bodyStr);
    req.end();
  });
}

// ── POST /api/market-feed  (proxies 5paisa — avoids browser CORS block) ───────
app.post("/api/market-feed", async (req, res) => {
  const vendorKey = process.env.FIVE_PAISA_KEY;
  if (!vendorKey)
    return res.status(500).json({ success: false, message: "FIVE_PAISA_KEY not set in .env" });

  try {
    const token = process.env.FIVE_PAISA_TOKEN || "";
    const data  = await fivePaisaPost(
      "/VendorsAPI/Service1.svc/V1/MarketFeed",
      {
        head: { key: vendorKey },
        body: {
          Count:           req.body.Count,
          MarketFeedData:  req.body.MarketFeedData,
          ClientLoginType: 0,
          LastRequestTime: "/Date(0)/",
          RefreshRate:     "H",
        },
      },
      token ? { Authorization: `bearer ${token}` } : {}
    );

    if (data?.body?.Status !== 0 && data?.body?.Status !== undefined)
      return res.status(400).json({ success: false, message: data?.body?.Message || "5paisa API error" });

    console.log("📈 MarketFeed fetched:", (data?.body?.Data || []).length, "scrips");
    res.json({ success: true, data: data?.body?.Data || [] });
  } catch (err) {
    console.error("❌ 5paisa MarketFeed error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/five-paisa-token  (generate & save access token — run once/day) ─
app.post("/api/five-paisa-token", async (req, res) => {
  const { appSource, userId, password, userKey, encryptionKey } = req.body;
  if (!appSource || !userId || !password || !userKey || !encryptionKey)
    return res.status(400).json({ success: false, message: "All 5 credentials are required." });

  try {
    // Step 1 — fetch server-side encryption key
    const encRes = await fivePaisaPost("/VendorsAPI/Service1.svc/EncryptionKey", {
      head: { key: userKey },
      body: { ClientLoginType: 0 },
    });
    const encKey = encRes?.body?.EncryptionKey;
    if (!encKey) throw new Error("Could not fetch EncryptionKey from 5paisa");

    // Step 2 — SHA-256 hash: encKey + password
    const crypto       = require("crypto");
    const encryptedPwd = crypto.createHash("sha256").update(encKey + password).digest("hex").toUpperCase();

    // Step 3 — login to get RequestToken
    const loginRes = await fivePaisaPost("/VendorsAPI/Service1.svc/V3/LoginRequestMobileNewbyEmail", {
      head: { key: userKey, appVer: "1.0", osName: "Web" },
      body: {
        Email_id: userId, Password: encryptedPwd,
        LocalIP: "127.0.0.1", PublicIP: "127.0.0.1",
        HDSerialNumber: "", MACAddress: "", MachineID: "WEB",
        VersionNo: "1.7", RequestNo: "1",
        My2PIN: encryptionKey, ConnectionType: "1",
      },
    });
    const requestToken = loginRes?.body?.RequestToken;
    if (!requestToken || loginRes?.body?.Status !== 0)
      throw new Error(loginRes?.body?.Message || "5paisa login failed — check your credentials");

    // Step 4 — exchange RequestToken for AccessToken
    const accessRes  = await fivePaisaPost("/VendorsAPI/Service1.svc/GetAccessToken", {
      head: { key: userKey },
      body: { RequestToken: requestToken, EncryptionKey: encKey },
    });
    const accessToken = accessRes?.body?.AccessToken;
    if (!accessToken) throw new Error("Failed to obtain AccessToken");

    // Auto-apply for this process lifetime
    process.env.FIVE_PAISA_TOKEN = accessToken;
    console.log("✅ 5paisa AccessToken generated and applied");

    res.json({
      success: true,
      accessToken,
      message: "Token is active. Also add it to your .env as FIVE_PAISA_TOKEN to persist across restarts.",
    });
  } catch (err) {
    console.error("❌ 5paisa token error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/download-users ───────────────────────────────────────────────────
app.get("/api/download-users", (req, res) => {
  if (!fs.existsSync(EXCEL_PATH)) {
    return res.status(404).json({ message: "No users file yet. Login first." });
  }
  res.setHeader("Content-Disposition", "attachment; filename=users.xlsx");
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  fs.createReadStream(EXCEL_PATH).pipe(res);
});

// ── GET /api/health ───────────────────────────────────────────────────────────
app.get("/api/health", (_, res) => res.json({
  status:      "ok",
  twilio:      process.env.TWILIO_ACCOUNT_SID ? "✓ configured" : "✗ missing",
  excel:       fs.existsSync(EXCEL_PATH)       ? "✓ exists"     : "will be created on first login",
  excelPath:   EXCEL_PATH,
  cwd:         process.cwd(),
  fivePaisa:   process.env.FIVE_PAISA_KEY      ? "✓ key set"    : "✗ FIVE_PAISA_KEY missing",
  token:       process.env.FIVE_PAISA_TOKEN    ? "✓ token set"  : "✗ no token (demo mode active)",
}));

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`\n🚀 OTP Server running on http://localhost:${PORT}`);
  console.log(`   Twilio Account: ${process.env.TWILIO_ACCOUNT_SID   ? "✓ configured" : "✗ missing"}`);
  console.log(`   Twilio Phone:   ${process.env.TWILIO_PHONE_NUMBER   ? "✓ configured" : "✗ missing"}`);
  console.log(`   Excel file:     ${EXCEL_PATH}\n`);
});