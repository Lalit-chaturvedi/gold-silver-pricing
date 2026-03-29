// ─── Gold · Silver Tracker — OTP Backend Server ──────────────────────────────
// Run: node server.js
// Requires: npm install express twilio cors dotenv exceljs

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

// ── Generic HTTPS GET helper ──────────────────────────────────────────────────
function httpsGet(hostname, urlPath) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname, path: urlPath, method: "GET", headers: { "Accept": "application/json" } },
      (resp) => {
        console.log(`   HTTP ${resp.statusCode} ← https://${hostname}${urlPath}`);
        let data = "";
        resp.on("data", c => data += c);
        resp.on("end", () => {
          if (resp.statusCode !== 200)
            return reject(new Error(`HTTP ${resp.statusCode} from ${hostname}${urlPath} → ${data.slice(0, 300)}`));
          try { resolve(JSON.parse(data)); }
          catch { reject(new Error(`Invalid JSON from ${hostname}${urlPath}`)); }
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

// ── Defensive field extractor (handles any field names gold-api.com returns) ──
function safeNum(val, fallback = 0) {
  const n = parseFloat(val);
  return isNaN(n) ? fallback : n;
}

function extractPrice(raw) {
  // Accept any known field name variants
  const price = safeNum(
    raw.price ?? raw.Price ?? raw.ltp ?? raw.rate ?? raw.close, 0
  );
  return {
    price,
    open:      safeNum(raw.open      ?? raw.Open      ?? raw.open_price,  price),
    high:      safeNum(raw.high      ?? raw.High      ?? raw.high_price,  price),
    low:       safeNum(raw.low       ?? raw.Low       ?? raw.low_price,   price),
    prevClose: safeNum(raw.prev_close ?? raw.prevClose ?? raw.previous_close ?? raw.close, price),
    change:    safeNum(raw.ch        ?? raw.change    ?? raw.Change,      0),
    changePct: safeNum(raw.chp       ?? raw.changePercent ?? raw.change_percent, 0),
    updatedAt: raw.updatedAt ?? raw.timestamp ?? new Date().toISOString(),
  };
}

// ── GET /api/market-feed ──────────────────────────────────────────────────────
// Drops 5paisa entirely. Uses gold-api.com (free · no auth · unlimited).
// Same response shape as before: { success, data: [{Symbol, LTP, ...}] }
app.get("/api/market-feed", async (req, res) => {
  try {
    // Fetch Gold + Silver in parallel
    const [goldRaw, silverRaw] = await Promise.all([
      httpsGet("api.gold-api.com", "/price/XAU"),
      httpsGet("api.gold-api.com", "/price/XAG"),
    ]);

    // Always log raw so you can see exact field names
    console.log("🔍 Gold raw   :", JSON.stringify(goldRaw));
    console.log("🔍 Silver raw :", JSON.stringify(silverRaw));

    // Live USD → INR (frankfurter.app — free, no key)
    let usdToInr = 86.5; // updated fallback for 2026
    try {
      const fx = await httpsGet("api.frankfurter.app", "/latest?from=USD&to=INR");
      if (fx?.rates?.INR) usdToInr = fx.rates.INR;
    } catch (e) {
      console.warn("⚠️  FX fallback ₹86.5 —", e.message);
    }
    console.log(`💱 1 USD = ₹${usdToInr}`);

    const gold   = extractPrice(goldRaw);
    const silver = extractPrice(silverRaw);

    const TROY_OZ = 31.1035; // grams per troy ounce

    // ── India price premiums (precisely calibrated against live market) ────────
    // India prices differ from raw USD→INR spot due to import duty + GST + MCX fees.
    // Calibrated on 29 Mar 2026 by comparing app output vs actual Google/MCX rates:
    //   App showed Gold ₹1,58,580 → target ₹1,48,090 → correction 0.9338
    //   App showed Silver ₹2,63,209 → target ₹2,45,000 → correction 0.9308
    //   Applied to previous premiums (1.181 & 1.261) → new values below.
    const GOLD_PREMIUM   = 1.1029;  // calibrated: Gold ₹1,48,090/10g
    const SILVER_PREMIUM = 1.1738;  // calibrated: Silver ₹2,45,000/kg

    const goldPer10g  = (u) => parseFloat(((u / TROY_OZ) * usdToInr * 10   * GOLD_PREMIUM  ).toFixed(2));
    const goldPerGram = (u) => parseFloat(((u / TROY_OZ) * usdToInr         * GOLD_PREMIUM  ).toFixed(2));
    const silverPerKg = (u) => parseFloat(((u / TROY_OZ) * usdToInr * 1000 * SILVER_PREMIUM).toFixed(2));
    const silverPerG  = (u) => parseFloat(((u / TROY_OZ) * usdToInr         * SILVER_PREMIUM).toFixed(2));

    const data = [
      {
        Symbol:        "GOLD",
        Name:          "Gold (24K)",
        Exch:          "INTL",
        LTP:           goldPer10g(gold.price),
        Open:          goldPer10g(gold.open),
        High:          goldPer10g(gold.high),
        Low:           goldPer10g(gold.low),
        PreviousClose: goldPer10g(gold.prevClose),
        Change:        gold.change,
        ChangePercent: gold.changePct,
        Unit:          "per 10g",
        PerGram:       goldPerGram(gold.price),
        USDPrice:      gold.price,
        USDToINR:      usdToInr,
        UpdatedAt:     gold.updatedAt,
      },
      {
        Symbol:        "SILVER",
        Name:          "Silver",
        Exch:          "INTL",
        LTP:           silverPerKg(silver.price),
        Open:          silverPerKg(silver.open),
        High:          silverPerKg(silver.high),
        Low:           silverPerKg(silver.low),
        PreviousClose: silverPerKg(silver.prevClose),
        Change:        silver.change,
        ChangePercent: silver.changePct,
        Unit:          "per kg",
        PerGram:       silverPerG(silver.price),
        USDPrice:      silver.price,
        USDToINR:      usdToInr,
        UpdatedAt:     silver.updatedAt,
      },
    ];

    console.log(`📈 Gold ₹${data[0].LTP}/10g | Silver ₹${data[1].LTP}/kg`);
    res.json({ success: true, data });

  } catch (err) {
    console.error("❌ /api/market-feed error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/debug-feed  (raw JSON dump from gold-api.com — for inspecting fields) ──
app.get("/api/debug-feed", async (req, res) => {
  try {
    const [gold, silver] = await Promise.all([
      httpsGet("api.gold-api.com", "/price/XAU"),
      httpsGet("api.gold-api.com", "/price/XAG"),
    ]);
    res.json({ gold, silver });
  } catch (err) {
    res.status(500).json({ error: err.message });
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
  marketData:  "✓ gold-api.com (free · no auth · no rate limit)",
}));

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`\n🚀 OTP Server running on http://localhost:${PORT}`);
  console.log(`   Twilio:      ${process.env.TWILIO_ACCOUNT_SID ? "✓ configured" : "✗ missing"}`);
  console.log(`   Market Data: ✓ gold-api.com (free · no key needed)`);
  console.log(`   Excel:       ${EXCEL_PATH}`);
  console.log(`\n   Test endpoints:`);
  console.log(`   GET http://localhost:${PORT}/api/debug-feed   ← raw API response`);
  console.log(`   GET http://localhost:${PORT}/api/market-feed  ← formatted prices\n`);
});