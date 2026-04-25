import { useState, useEffect, useCallback, useRef } from "react";

// ─── Config ───────────────────────────────────────────────────────────────────
// Auto-detects environment:
// - On localhost → hits local backend at port 4000
// - On deployed domain → uses relative path (Hostinger proxies /api to backend)
const OTP_SERVER = "https://ramagold.in";

const GOLD_SCRIPS = [
  { label: "GOLD",  productLabel: "Gold 99.5",   sublabel: "Hajar", Exch: "M", ExchType: "D", ScripCode: "57592", unit: "10g",  metal: "gold" },
  { label: "GOLDM", productLabel: "Gold 99.5",   sublabel: "T+2",   Exch: "M", ExchType: "D", ScripCode: "57607", unit: "1g",   metal: "gold" },
];
const SILVER_SCRIPS = [
  { label: "SILVER",  productLabel: "Silver 99.00", sublabel: "Hajar", Exch: "M", ExchType: "D", ScripCode: "57630", unit: "1kg",  metal: "silver" },
  { label: "SILVERM", productLabel: "Silver 99.00", sublabel: "T+2",   Exch: "M", ExchType: "D", ScripCode: "57631", unit: "100g", metal: "silver" },
];
const ALL_SCRIPS = [...GOLD_SCRIPS, ...SILVER_SCRIPS];
const ADMIN_CREDENTIALS = { username: "admin", password: "admin@123" };
const REFRESH_INTERVAL  = 30000;
const OTP_RESEND_COOLDOWN = 30; // seconds

// ─── Storage ──────────────────────────────────────────────────────────────────
const storage = {
  get: (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del: (k)    => { try { localStorage.removeItem(k); } catch {} },
};

// ─── Utilities ────────────────────────────────────────────────────────────────
const fmt     = (n) => new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(n);
const fmtTime = (d) => d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

function parseTickDate(t) {
  if (!t) return null;
  const m = String(t).match(/\d+/);
  return m ? new Date(parseInt(m[0])) : null;
}

function useWindowWidth() {
  const [w, setW] = useState(typeof window !== "undefined" ? window.innerWidth : 1200);
  useEffect(() => {
    const h = () => setW(window.innerWidth);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return w;
}

// ─── Fetch prices ────────────────────────────────────────────────────────────
// When OTP_DISABLED: hits gold-api.com directly from browser (CORS enabled, free)
// When backend is running: proxies through backend server
const TROY_OZ     = 31.1035;
const GOLD_PREM   = 1.1029;
const SILVER_PREM = 1.1738;

async function fetchDirect() {
  // Fetch Gold, Silver and USD/INR in parallel
  const [gRes, sRes, fxRes] = await Promise.all([
    fetch("https://api.gold-api.com/price/XAU"),
    fetch("https://api.gold-api.com/price/XAG"),
    fetch("https://api.frankfurter.app/latest?from=USD&to=INR"),
  ]);
  const [g, s, fx] = await Promise.all([gRes.json(), sRes.json(), fxRes.json()]);
  const usdToInr = fx?.rates?.INR || 86.5;
  const safeNum  = (v, fb = 0) => { const n = parseFloat(v); return isNaN(n) ? fb : n; };
  const gp = safeNum(g.price || g.Price);
  const sp = safeNum(s.price || s.Price);
  const per10g = (u) => parseFloat(((u / TROY_OZ) * usdToInr * 10   * GOLD_PREM  ).toFixed(2));
  const perKg  = (u) => parseFloat(((u / TROY_OZ) * usdToInr * 1000 * SILVER_PREM).toFixed(2));
  const perGram = (u, prem) => parseFloat(((u / TROY_OZ) * usdToInr * prem).toFixed(2));
  return [
    {
      Symbol: "GOLD", LTP: per10g(gp),
      Open: per10g(safeNum(g.open || g.Open, gp)),
      High: per10g(safeNum(g.high || g.High, gp)),
      Low:  per10g(safeNum(g.low  || g.Low,  gp)),
      PreviousClose: per10g(safeNum(g.prev_close || g.prevClose, gp)),
      Change: safeNum(g.ch || g.change, 0),
      ChangePercent: safeNum(g.chp || g.changePercent, 0),
      PerGram: perGram(gp, GOLD_PREM), USDToINR: usdToInr,
      UpdatedAt: g.updatedAt || new Date().toISOString(),
    },
    {
      Symbol: "SILVER", LTP: perKg(sp),
      Open: perKg(safeNum(s.open || s.Open, sp)),
      High: perKg(safeNum(s.high || s.High, sp)),
      Low:  perKg(safeNum(s.low  || s.Low,  sp)),
      PreviousClose: perKg(safeNum(s.prev_close || s.prevClose, sp)),
      Change: safeNum(s.ch || s.change, 0),
      ChangePercent: safeNum(s.chp || s.changePercent, 0),
      PerGram: perGram(sp, SILVER_PREM), USDToINR: usdToInr,
      UpdatedAt: s.updatedAt || new Date().toISOString(),
    },
  ];
}

async function fetchAllPrices() {
  // If backend is running, use it; otherwise call gold-api.com directly
  const backendUrl = window.location.hostname === "localhost"
    ? "http://localhost:4000/api/market-feed"
    : null; // no backend on deployed site yet

  if (backendUrl) {
    try {
      const res = await fetch(backendUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.message || "Market feed error");
      return data.data || [];
    } catch {
      // fallback to direct if backend unreachable
      return fetchDirect();
    }
  }

  return fetchDirect();
}

function getMockData() {
  // Realistic 2026 India prices: Gold ₹1,48,090/10g | Silver ₹2,45,000/kg
  const bases = { GOLD: 148090, GOLDM: 14809, SILVER: 245000, SILVERM: 24500 };
  return ALL_SCRIPS.map((s) => ({
    Symbol:        s.label,
    LTP:           bases[s.label] + Math.random() * 500 - 250,
    High:          bases[s.label] + 800,
    Low:           bases[s.label] - 700,
    PreviousClose: bases[s.label] - 200 + Math.random() * 400,
    Open:          bases[s.label] - 100 + Math.random() * 200,
    Change:        (Math.random() * 400 - 200).toFixed(2),
    ChangePercent: (Math.random() * 0.6 - 0.3).toFixed(2),
    UpdatedAt:     new Date().toISOString(),
    _mock:         true,
  }));
}

// ─── Global CSS ───────────────────────────────────────────────────────────────
const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400&family=Outfit:wght@300;400;500;600;700&display=swap');

  :root {
    --gold: #C9963A;
    --gold-bright: #F0C060;
    --gold-deep: #7A5A1A;
    --bg: #0D0804;
    --surface: rgba(255,255,255,0.03);
    --surface2: rgba(255,255,255,0.05);
    --border: rgba(201,150,58,0.15);
    --border2: rgba(255,255,255,0.07);
    --text: #F2E8D8;
    --muted: #8A7A62;
    --muted2: #6A5A48;
    --buy: #5CB87A;
    --sell: #E07060;
    --admin: #7B9CDE;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    background: var(--bg);
    color: var(--text);
    font-family: 'Outfit', sans-serif;
  }

  @keyframes spin     { to { transform: rotate(360deg); } }
  @keyframes pulse    { 0%,100%{opacity:1;transform:scale(1);} 50%{opacity:0.3;transform:scale(0.7);} }
  @keyframes cardIn   { from{opacity:0;transform:translateY(16px);} to{opacity:1;transform:translateY(0);} }
  @keyframes modalIn  { from{opacity:0;transform:scale(0.96) translateY(-8px);} to{opacity:1;transform:scale(1) translateY(0);} }
  @keyframes slideUp  { from{transform:translateY(100%);} to{transform:translateY(0);} }
  @keyframes fadeUp   { from{opacity:0;transform:translateY(20px);} to{opacity:1;transform:translateY(0);} }
  @keyframes shake    { 0%,100%{transform:translateX(0)} 20%,60%{transform:translateX(-6px)} 40%,80%{transform:translateX(6px)} }
  @keyframes logoPulse{ 0%,100%{filter:drop-shadow(0 0 18px rgba(201,150,58,0.3));} 50%{filter:drop-shadow(0 0 30px rgba(201,150,58,0.55));} }
  @keyframes blink    { 0%,100%{opacity:1;transform:scale(1);} 50%{opacity:0.3;transform:scale(0.7);} }

  .price-card { animation: cardIn 0.5s cubic-bezier(.2,.8,.2,1) both; }
  .price-card:hover { transform: translateY(-2px); border-color: rgba(201,150,58,0.32) !important; box-shadow: 0 8px 32px rgba(0,0,0,0.4); }

  input:focus { border-color: rgba(201,150,58,0.5) !important; outline: none; }
  input::placeholder { color: var(--muted2); }
  .otp-input { text-align: center; letter-spacing: 8px; font-size: 24px !important; font-family: monospace !important; }

  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: #0D0804; }
  ::-webkit-scrollbar-thumb { background: rgba(201,150,58,0.2); border-radius: 10px; }

  .shake { animation: shake 0.4s ease; }
  .anim-fu { animation: fadeUp 0.5s ease both; }
`;

// ─── Shared UI pieces ─────────────────────────────────────────────────────────
function Spinner({ color = "#C9963A", size = 16 }) {
  return (
    <span style={{ display: "inline-block", width: size, height: size, verticalAlign: "middle" }}>
      <svg viewBox="0 0 24 24" style={{ animation: "spin 1s linear infinite", display: "block" }}>
        <circle cx="12" cy="12" r="10" fill="none" stroke={color} strokeWidth="3" strokeDasharray="31" strokeDashoffset="10" />
      </svg>
    </span>
  );
}

function BgFx() {
  return (
    <div style={{
      position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0,
      background: "radial-gradient(ellipse 70% 45% at 50% 0%, rgba(180,100,20,0.10) 0%, transparent 70%), radial-gradient(ellipse 40% 30% at 85% 85%, rgba(100,60,10,0.07) 0%, transparent 60%)",
    }} />
  );
}

// ─── LOGIN PAGE ───────────────────────────────────────────────────────────────
// ─── Ramagold Logo SVG ───────────────────────────────────────────────────────
function RamagoldLogo({ size = 100, glow = true }) {
  return (
    <svg
      width={size} height={size}
      viewBox="0 0 200 200"
      xmlns="http://www.w3.org/2000/svg"
      style={{
        filter: glow
          ? "drop-shadow(0 0 16px rgba(201,150,58,0.5)) drop-shadow(0 0 6px rgba(201,150,58,0.3))"
          : "none",
        animation: glow ? "logoPulse 3s ease-in-out infinite" : "none",
        flexShrink: 0,
      }}
    >
      <defs>
        <radialGradient id="goldGrad" cx="50%" cy="40%" r="60%">
          <stop offset="0%"   stopColor="#F5D07A" />
          <stop offset="50%"  stopColor="#C9963A" />
          <stop offset="100%" stopColor="#7A5A1A" />
        </radialGradient>
        <radialGradient id="bgGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#2A1A08" />
          <stop offset="100%" stopColor="#0D0804" />
        </radialGradient>
      </defs>

      {/* Dark circle background */}
      <circle cx="100" cy="100" r="76" fill="url(#bgGrad)" stroke="url(#goldGrad)" strokeWidth="1.5" />

      {/* Outer decorative ring */}
      <circle cx="100" cy="100" r="72" fill="none" stroke="#C9963A" strokeWidth="0.6" strokeDasharray="3 4" opacity="0.6" />

      {/* Top ornament - bow/ribbon */}
      <path d="M100 20 C92 24 86 30 90 35 C94 40 100 36 100 36 C100 36 106 40 110 35 C114 30 108 24 100 20Z"
            fill="url(#goldGrad)" />
      <circle cx="100" cy="22" r="3" fill="url(#goldGrad)" />

      {/* Top filigree scrolls */}
      <path d="M78 34 C72 30 64 34 66 40 C68 45 75 44 78 40" fill="none" stroke="url(#goldGrad)" strokeWidth="1.8" strokeLinecap="round"/>
      <path d="M122 34 C128 30 136 34 134 40 C132 45 125 44 122 40" fill="none" stroke="url(#goldGrad)" strokeWidth="1.8" strokeLinecap="round"/>
      <circle cx="66" cy="40" r="2.5" fill="url(#goldGrad)" />
      <circle cx="134" cy="40" r="2.5" fill="url(#goldGrad)" />

      {/* Side filigree left */}
      <path d="M28 90 C22 85 22 78 28 76 C34 74 38 80 36 86 C34 92 28 94 26 100 C24 106 28 112 34 112"
            fill="none" stroke="url(#goldGrad)" strokeWidth="1.6" strokeLinecap="round"/>
      <circle cx="26" cy="100" r="2" fill="url(#goldGrad)" opacity="0.7"/>

      {/* Side filigree right */}
      <path d="M172 90 C178 85 178 78 172 76 C166 74 162 80 164 86 C166 92 172 94 174 100 C176 106 172 112 166 112"
            fill="none" stroke="url(#goldGrad)" strokeWidth="1.6" strokeLinecap="round"/>
      <circle cx="174" cy="100" r="2" fill="url(#goldGrad)" opacity="0.7"/>

      {/* Bottom chandelier drops */}
      <path d="M80 156 C78 162 76 168 78 174" fill="none" stroke="url(#goldGrad)" strokeWidth="1.4" strokeLinecap="round"/>
      <path d="M90 160 C89 168 89 174 90 180" fill="none" stroke="url(#goldGrad)" strokeWidth="1.4" strokeLinecap="round"/>
      <path d="M100 162 C100 170 100 176 100 182" fill="none" stroke="url(#goldGrad)" strokeWidth="1.4" strokeLinecap="round"/>
      <path d="M110 160 C111 168 111 174 110 180" fill="none" stroke="url(#goldGrad)" strokeWidth="1.4" strokeLinecap="round"/>
      <path d="M120 156 C122 162 124 168 122 174" fill="none" stroke="url(#goldGrad)" strokeWidth="1.4" strokeLinecap="round"/>
      <circle cx="78" cy="174" r="2.5" fill="url(#goldGrad)" />
      <circle cx="90" cy="180" r="2.5" fill="url(#goldGrad)" />
      <circle cx="100" cy="182" r="2.5" fill="url(#goldGrad)" />
      <circle cx="110" cy="180" r="2.5" fill="url(#goldGrad)" />
      <circle cx="122" cy="174" r="2.5" fill="url(#goldGrad)" />

      {/* Bottom center lotus */}
      <path d="M94 152 C94 146 100 143 100 143 C100 143 106 146 106 152" fill="none" stroke="url(#goldGrad)" strokeWidth="1.6"/>
      <circle cx="100" cy="155" r="3" fill="url(#goldGrad)" />

      {/* Corner scroll ornaments */}
      <path d="M54 54 C50 48 44 50 44 56 C44 62 50 62 54 58" fill="none" stroke="url(#goldGrad)" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M146 54 C150 48 156 50 156 56 C156 62 150 62 146 58" fill="none" stroke="url(#goldGrad)" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M54 146 C50 152 44 150 44 144 C44 138 50 138 54 142" fill="none" stroke="url(#goldGrad)" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M146 146 C150 152 156 150 156 144 C156 138 150 138 146 142" fill="none" stroke="url(#goldGrad)" strokeWidth="1.5" strokeLinecap="round"/>

      {/* RG Monogram */}
      {/* R */}
      <text x="67" y="118" fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="52" fontWeight="700"
            fill="url(#goldGrad)" letterSpacing="-2">RG</text>
    </svg>
  );
}

// OTP_DISABLED = true  → login page shown but OTP step skipped, direct entry
// OTP_DISABLED = false → full OTP flow restored
const OTP_DISABLED = true;

function LoginPage({ onOtpSent, onDirectLogin }) {
  const [name, setName]       = useState("");
  const [phone, setPhone]     = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  async function handleSend() {
    setError("");
    const cleanPhone = phone.replace(/\D/g, "");
    if (!name.trim()) { setError("Please enter your name."); return; }
    if (!/^[6-9]\d{9}$/.test(cleanPhone)) { setError("Enter a valid 10-digit Indian mobile number."); return; }

    // OTP disabled: skip API, log in directly
    if (OTP_DISABLED) {
      const user = { name: name.trim(), phone: `+91${cleanPhone}`, loginAt: Date.now() };
      storage.set("user", user);
      onDirectLogin(user);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${OTP_SERVER}/api/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), phone: cleanPhone }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      onOtpSent({ name: name.trim(), phone: cleanPhone });
    } catch (e) {
      setError(e.message || "Failed to send OTP. Please try again.");
    }
    setLoading(false);
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 20px", position: "relative" }}>
      <style>{GLOBAL_CSS}</style>
      <BgFx />

      <div style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: 400, animation: "fadeUp 0.6s cubic-bezier(.16,1,.3,1)" }}>
        {/* Logo + Brand */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <RamagoldLogo size={110} glow={true} />
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 32, fontWeight: 700, color: "var(--gold-bright)", marginBottom: 4, marginTop: 8 }}>
            Ramagold.in
          </div>
          <div style={{ fontSize: 11, letterSpacing: 3, textTransform: "uppercase", color: "var(--muted)" }}>
            Transparent · Accurate · Trusted
          </div>
        </div>

        {/* Card */}
        <div style={{
          background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 20,
          padding: "32px", position: "relative", overflow: "hidden",
        }}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: "linear-gradient(to right, transparent, rgba(201,150,58,0.4), transparent)" }} />

          <div style={{ fontSize: 12, letterSpacing: 3, textTransform: "uppercase", color: "var(--muted)", textAlign: "center", marginBottom: 24 }}>
            Sign In to Continue
          </div>

          {/* Name */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: "var(--muted)", marginBottom: 7 }}>Full Name</label>
            <input
              value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. Rajesh Kumar"
              style={{
                width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(201,150,58,0.2)",
                borderRadius: 10, padding: "11px 14px", color: "var(--text)", fontFamily: "'Outfit', sans-serif",
                fontSize: 14, transition: "border-color 0.2s",
              }}
            />
          </div>

          {/* Phone */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: "block", fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: "var(--muted)", marginBottom: 7 }}>Mobile Number</label>
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{
                background: "rgba(255,255,255,0.04)", border: "1px solid rgba(201,150,58,0.2)",
                borderRadius: 10, padding: "11px 14px", color: "var(--muted)", fontSize: 14, flexShrink: 0,
              }}>🇮🇳 +91</div>
              <input
                value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                placeholder="9876543210" type="tel"
                onKeyDown={e => e.key === "Enter" && handleSend()}
                style={{
                  flex: 1, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(201,150,58,0.2)",
                  borderRadius: 10, padding: "11px 14px", color: "var(--text)", fontFamily: "monospace",
                  fontSize: 14, letterSpacing: 2, transition: "border-color 0.2s",
                }}
              />
            </div>
          </div>

          {error && (
            <div style={{ fontSize: 12, color: "var(--sell)", textAlign: "center", marginBottom: 14 }}>{error}</div>
          )}

          <button onClick={handleSend} disabled={loading} style={{
            width: "100%", background: loading ? "rgba(255,255,255,0.05)" : "linear-gradient(135deg, var(--gold-deep), var(--gold))",
            border: "none", borderRadius: 10, padding: "13px",
            color: loading ? "var(--muted)" : "#FFF8E8",
            fontFamily: "'Outfit', sans-serif", fontSize: 14, fontWeight: 600, letterSpacing: 1,
            cursor: loading ? "wait" : "pointer", transition: "all 0.2s",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}>
            {loading ? <><Spinner color="var(--muted)" /> Please wait...</> : OTP_DISABLED ? "Continue →" : "Send OTP →"}
          </button>

          <div style={{ marginTop: 14, fontSize: 11, color: "var(--muted2)", textAlign: "center" }}>
            {OTP_DISABLED ? "Enter your details to continue" : "An OTP will be sent to your mobile via SMS"}
          </div>
        </div>
      </div>
    </div>
  );
}

function OtpPage({ userData, onVerified, onBack }) {
  const [otp, setOtp]               = useState("");
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState("");
  const [resendTimer, setResendTimer] = useState(OTP_RESEND_COOLDOWN);
  const [resending, setResending]   = useState(false);
  const [shaking, setShaking]       = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Countdown timer for resend
  useEffect(() => {
    if (resendTimer <= 0) return;
    const t = setInterval(() => setResendTimer(c => c - 1), 1000);
    return () => clearInterval(t);
  }, [resendTimer]);

  function triggerShake() {
    setShaking(true);
    setTimeout(() => setShaking(false), 500);
  }

  async function handleVerify() {
    if (otp.length !== 6) { setError("Enter the 6-digit OTP."); triggerShake(); return; }
    setError(""); setLoading(true);
    try {
      const res = await fetch(`${OTP_SERVER}/api/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: userData.phone, otp }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      // Save session with timestamp
      const userWithTime = { ...data.user, loginAt: Date.now() };
      storage.set("user", userWithTime);
      onVerified(userWithTime);
    } catch (e) {
      setError(e.message || "Verification failed.");
      triggerShake();
      setOtp("");
    }
    setLoading(false);
  }

  async function handleResend() {
    setResending(true); setError("");
    try {
      const res = await fetch(`${OTP_SERVER}/api/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: userData.name, phone: userData.phone }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      setResendTimer(OTP_RESEND_COOLDOWN);
      setOtp("");
    } catch (e) {
      setError(e.message || "Failed to resend OTP.");
    }
    setResending(false);
  }

  const maskedPhone = `+91 XXXXXX${userData.phone.slice(-4)}`;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 20px", position: "relative" }}>
      <style>{GLOBAL_CSS}</style>
      <BgFx />
      <div style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: 400, animation: "fadeUp 0.5s ease" }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 12, marginBottom: 24, display: "flex", alignItems: "center", gap: 6, fontFamily: "'Outfit', sans-serif" }}>← Back</button>

        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <RamagoldLogo size={72} glow={true} />
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 26, fontWeight: 700, color: "var(--gold-bright)", marginTop: 8 }}>Ramagold.in</div>
          <div style={{ fontSize: 11, letterSpacing: 3, textTransform: "uppercase", color: "var(--muted)", marginTop: 4 }}>OTP Verification</div>
        </div>

        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 20, padding: "32px", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: "linear-gradient(to right, transparent, rgba(201,150,58,0.4), transparent)" }} />

          <div style={{ background: "rgba(92,184,122,0.08)", border: "1px solid rgba(92,184,122,0.2)", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "var(--buy)", textAlign: "center", marginBottom: 20, letterSpacing: 1 }}>
            OTP sent to {maskedPhone}
          </div>

          <input
            ref={inputRef} value={otp}
            onChange={e => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
            onKeyDown={e => e.key === "Enter" && handleVerify()}
            placeholder="••••••" type="tel"
            className={`otp-input${shaking ? " shake" : ""}`}
            style={{
              width: "100%", background: "rgba(255,255,255,0.04)",
              border: `1px solid ${error ? "var(--sell)" : "rgba(201,150,58,0.25)"}`,
              borderRadius: 12, padding: "16px", color: "var(--gold-bright)",
              marginBottom: 16, transition: "border-color 0.2s",
            }}
          />

          {error && <div style={{ fontSize: 12, color: "var(--sell)", textAlign: "center", marginBottom: 14 }}>{error}</div>}

          <button onClick={handleVerify} disabled={loading || otp.length !== 6} style={{
            width: "100%", padding: "13px", borderRadius: 10, border: "none",
            background: otp.length === 6 && !loading ? "linear-gradient(135deg, var(--gold-deep), var(--gold))" : "rgba(255,255,255,0.05)",
            color: otp.length === 6 && !loading ? "#FFF8E8" : "var(--muted)",
            fontFamily: "'Outfit', sans-serif", fontWeight: 600, fontSize: 14,
            cursor: otp.length === 6 && !loading ? "pointer" : "not-allowed",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}>
            {loading ? <><Spinner /> Verifying...</> : "Verify OTP ✓"}
          </button>

          <div style={{ marginTop: 18, textAlign: "center" }}>
            {resendTimer > 0 ? (
              <span style={{ fontSize: 12, color: "var(--muted2)" }}>Resend in <span style={{ color: "var(--gold)", fontFamily: "monospace" }}>{resendTimer}s</span></span>
            ) : (
              <button onClick={handleResend} disabled={resending} style={{ background: "none", border: "none", color: "var(--gold)", cursor: resending ? "wait" : "pointer", fontSize: 12, fontFamily: "'Outfit', sans-serif", display: "inline-flex", alignItems: "center", gap: 6 }}>
                {resending ? <><Spinner size={12} /> Sending...</> : "Resend OTP"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PriceRow({ scrip, data, buyCommission, buyCommissionType, sellCommission, sellCommissionType, idx }) {
  const isGold    = scrip.metal === "gold";
  const ltp       = data?.LTP ?? data?.LastRate ?? 0;
  const pclose    = data?.PreviousClose ?? data?.PClose ?? 0;
  const change    = ltp - pclose;
  const changePct = pclose ? (change / pclose) * 100 : 0;
  const isUp      = change >= 0;
  const tickDate  = data?.UpdatedAt ? new Date(data.UpdatedAt) : null;

  const accent = isGold ? "var(--gold)" : "var(--admin)";

  const buyCommVal  = buyCommissionType  === "percent" ? ltp * (buyCommission  / 100) : Number(buyCommission);
  const sellCommVal = sellCommissionType === "percent" ? ltp * (sellCommission / 100) : Number(sellCommission);
  const buyPrice    = ltp + buyCommVal;
  const sellPrice   = ltp + sellCommVal;

  return (
    <div className="price-card" style={{
      background: "var(--surface)", border: "1px solid var(--border)",
      borderRadius: 16, marginBottom: 10, overflow: "hidden", position: "relative",
      transition: "transform 0.2s, border-color 0.2s, box-shadow 0.2s",
      animationDelay: `${idx * 0.08}s`,
    }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: "linear-gradient(to right, transparent, rgba(201,150,58,0.3), transparent)" }} />

      {data?._mock && (
        <span style={{ position: "absolute", top: 10, right: 10, fontSize: 9, color: "var(--muted2)", background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.06)", padding: "2px 7px", borderRadius: 20, letterSpacing: 2, textTransform: "uppercase" }}>DEMO</span>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr", alignItems: "center", padding: "16px 22px", gap: 8 }}>
        {/* Product */}
        <div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, fontWeight: 700, color: "var(--gold-bright)", marginBottom: 4 }}>
            {scrip.productLabel || scrip.label}
          </div>
          <div style={{ display: "inline-block", fontSize: 10, letterSpacing: 1, color: "var(--muted)", background: "rgba(255,255,255,0.04)", padding: "2px 9px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.06)" }}>
            {scrip.sublabel} · MCX
          </div>
          <div style={{ marginTop: 7, display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: isUp ? "var(--buy)" : "var(--sell)", background: isUp ? "rgba(92,184,122,0.12)" : "rgba(224,112,96,0.12)", padding: "2px 8px", borderRadius: 6 }}>
              {isUp ? "▲" : "▼"} {fmt(Math.abs(changePct))}%
            </span>
            {tickDate && <span style={{ fontSize: 9, color: "var(--muted2)", fontFamily: "monospace" }}>{fmtTime(tickDate)}</span>}
          </div>
        </div>

        {/* Buy */}
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: "rgba(92,184,122,0.6)", marginBottom: 4 }}>Buy ₹</div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "clamp(18px,2.2vw,22px)", fontWeight: 700, color: "var(--buy)", letterSpacing: -0.5 }}>
            {fmt(buyPrice)}
          </div>
          <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>per {scrip.unit}</div>
        </div>

        {/* Sell */}
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: "rgba(224,112,96,0.6)", marginBottom: 4 }}>Sell ₹</div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "clamp(18px,2.2vw,22px)", fontWeight: 700, color: "var(--sell)", letterSpacing: -0.5 }}>
            {fmt(sellPrice)}
          </div>
          <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>per {scrip.unit}</div>
        </div>
      </div>
    </div>
  );
}

function MetalSection({ metal, scrips, buyCommission, buyCommissionType, sellCommission, sellCommissionType, getDataForScrip }) {
  const isGold = metal === "gold";
  const icon   = isGold ? "⬡" : "◈";
  const label  = isGold ? "MCX Gold" : "MCX Silver";
  const color  = isGold ? "var(--gold)" : "var(--admin)";

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 10, letterSpacing: 3, textTransform: "uppercase", color: "var(--muted)", margin: "16px 0 8px" }}>
        <span style={{ filter: isGold ? "drop-shadow(0 0 6px rgba(201,150,58,0.7))" : "none", fontSize: 14, color }}>{icon}</span>
        <span>{label}</span>
        <div style={{ flex: 1, height: 1, background: `linear-gradient(to right, rgba(201,150,58,0.2), transparent)` }} />
      </div>
      {scrips.map((scrip, i) => (
        <PriceRow
          key={scrip.ScripCode} scrip={scrip} data={getDataForScrip(scrip)}
          buyCommission={buyCommission} buyCommissionType={buyCommissionType}
          sellCommission={sellCommission} sellCommissionType={sellCommissionType}
          idx={i}
        />
      ))}
    </div>
  );
}

function CommissionField({ label, color, value, type, onValueChange, onTypeChange }) {
  const inputStyle = {
    width: "100%", background: "#040609", border: "1px solid var(--border)",
    borderRadius: 9, padding: "10px 12px", color: "#7090A8", fontSize: 14,
    outline: "none", fontFamily: "inherit", boxSizing: "border-box",
  };
  return (
    <div style={{
      background: "#06090F", border: `1px solid ${color}18`,
      borderRadius: 12, padding: "16px",
    }}>
      <div style={{ fontSize: 9, color: color, letterSpacing: 3, fontWeight: 700, marginBottom: 12 }}>{label}</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        {["flat", "percent"].map(t => (
          <button key={t} onClick={() => onTypeChange(t)} style={{
            flex: 1, padding: "8px 0", borderRadius: 8, cursor: "pointer",
            border: `1px solid ${type === t ? color : "#1A2A3A"}`,
            background: type === t ? color + "18" : "transparent",
            color: type === t ? color : "var(--muted)",
            fontWeight: 700, fontSize: 11, transition: "all 0.2s", fontFamily: "inherit",
          }}>{t === "flat" ? "₹ Flat" : "% Percent"}</button>
        ))}
      </div>
      <input
        value={value}
        onChange={e => onValueChange(e.target.value)}
        placeholder={type === "flat" ? "500" : "2.5"}
        type="number" min="0"
        style={inputStyle}
      />
    </div>
  );
}

function AdminPanel({ buyCommission, buyCommissionType, sellCommission, sellCommissionType, onSave, onClose }) {
  const [bc, setBc] = useState(String(buyCommission));
  const [bt, setBt] = useState(buyCommissionType);
  const [sc, setSc] = useState(String(sellCommission));
  const [st, setSt] = useState(sellCommissionType);
  const [saved, setSaved] = useState(false);
  const [err, setErr]     = useState("");

  function save() {
    const bv = parseFloat(bc), sv = parseFloat(sc);
    if (isNaN(bv) || bv < 0) { setErr("Enter a valid buy commission"); return; }
    if (isNaN(sv) || sv < 0) { setErr("Enter a valid sell commission"); return; }
    if (bt === "percent" && bv > 100) { setErr("Buy percent cannot exceed 100"); return; }
    if (st === "percent" && sv > 100) { setErr("Sell percent cannot exceed 100"); return; }
    setErr("");
    onSave({ buyCommission: bv, buyCommissionType: bt, sellCommission: sv, sellCommissionType: st });
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000, background: "#000000B0", backdropFilter: "blur(10px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: "#13100A",
        border: "1px solid var(--border)", borderRadius: 22,
        padding: "32px 28px", width: "100%", maxWidth: 480,
        boxShadow: "0 40px 120px #000000AA",
        animation: "modalIn 0.3s cubic-bezier(.2,.8,.2,1)",
        maxHeight: "90vh", overflowY: "auto",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 9, color: "var(--muted)", letterSpacing: 3, marginBottom: 5 }}>CONFIGURATION</div>
            <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 22, fontWeight: 700, color: "var(--muted)" }}>Admin Settings</div>
          </div>
          <button onClick={onClose} style={{ width: 36, height: 36, borderRadius: "50%", border: "1px solid var(--border)", background: "none", color: "var(--muted)", cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>

        {/* API info banner */}
        <div style={{
          background: "rgba(92,184,122,0.06)", border: "1px solid rgba(92,184,122,0.2)", borderRadius: 10,
          padding: "12px 16px", marginBottom: 22, fontSize: 11, color: "var(--buy)", lineHeight: 1.6,
        }}>
          🔑 <strong style={{ color: "var(--buy)" }}>Live prices powered by gold-api.com</strong><br />
          Free · No API key required · Auto-refreshes every {REFRESH_INTERVAL / 1000}s
        </div>

        <div style={{ fontSize: 8, color: "var(--muted)", letterSpacing: 3, marginBottom: 14, fontWeight: 700 }}>COMMISSION SETTINGS</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 18 }}>
          <CommissionField
            label="BUY COMMISSION"
            color="var(--buy)"
            value={bc} type={bt}
            onValueChange={setBc} onTypeChange={setBt}
          />
          <CommissionField
            label="SELL COMMISSION"
            color="var(--sell)"
            value={sc} type={st}
            onValueChange={setSc} onTypeChange={setSt}
          />
        </div>

        {err && <div style={{ color: "var(--sell)", fontSize: 11, marginBottom: 10 }}>{err}</div>}
        <button onClick={save} style={{
          width: "100%", padding: "13px", borderRadius: 11, cursor: "pointer",
          background: saved ? "rgba(92,184,122,0.1)" : "linear-gradient(135deg, var(--gold-deep), var(--gold))",
          border: saved ? "1px solid rgba(92,184,122,0.3)" : "none",
          color: saved ? "var(--buy)" : "#FFF8E8",
          fontWeight: 900, fontSize: 14, transition: "all 0.3s", fontFamily: "inherit",
        }}>
          {saved ? "✓ Saved" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}

function AdminLoginModal({ onLogin, onClose }) {
  const [u, setU] = useState(""); const [p, setP] = useState("");
  const [err, setErr] = useState(""); const [loading, setLoading] = useState(false);
  function go() {
    setLoading(true);
    setTimeout(() => {
      if (u === ADMIN_CREDENTIALS.username && p === ADMIN_CREDENTIALS.password) onLogin();
      else setErr("Invalid credentials");
      setLoading(false);
    }, 600);
  }
  const inputStyle = {
    width: "100%", background: "#040609", border: "1px solid var(--border)",
    borderRadius: 9, padding: "11px 13px", color: "#7090A8", fontSize: 14,
    outline: "none", fontFamily: "inherit", boxSizing: "border-box",
  };
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000, background: "#000000B0", backdropFilter: "blur(10px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }} onClick={e => e.target === e.currentTarget && onClose?.()}>
      <div style={{
        background: "#13100A", border: "1px solid var(--border)", borderRadius: 22,
        padding: "36px 28px", width: "100%", maxWidth: 360,
        boxShadow: "0 40px 120px rgba(0,0,0,0.8)",
        animation: "modalIn 0.3s cubic-bezier(.2,.8,.2,1)", textAlign: "center",
        position: "relative", overflow: "hidden",
      }}>
        {/* Shimmer top border */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: "linear-gradient(to right, transparent, rgba(201,150,58,0.5), transparent)" }} />

        {/* Logo */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
          <RamagoldLogo size={80} glow={true} />
        </div>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 700, color: "var(--gold-bright)", marginBottom: 2 }}>Ramagold.in</div>
        <div style={{ fontSize: 9, color: "var(--muted)", letterSpacing: 4, textTransform: "uppercase", marginBottom: 24 }}>Admin Access</div>

        <div style={{ textAlign: "left", marginBottom: 14 }}>
          <div style={{ fontSize: 10, color: "var(--muted)", letterSpacing: 2, textTransform: "uppercase", marginBottom: 7 }}>Username</div>
          <input value={u} onChange={e => setU(e.target.value)} placeholder="admin" style={inputStyle} />
        </div>
        <div style={{ textAlign: "left", marginBottom: 14 }}>
          <div style={{ fontSize: 10, color: "var(--muted)", letterSpacing: 2, textTransform: "uppercase", marginBottom: 7 }}>Password</div>
          <input value={p} onChange={e => setP(e.target.value)} placeholder="••••••••" type="password"
            onKeyDown={e => e.key === "Enter" && go()} style={inputStyle} />
        </div>
        {err && <div style={{ color: "var(--sell)", fontSize: 12, marginBottom: 12 }}>{err}</div>}
        <button onClick={go} disabled={loading} style={{
          width: "100%", padding: "12px", borderRadius: 10, border: "none",
          background: loading ? "rgba(255,255,255,0.05)" : "linear-gradient(135deg, var(--gold-deep), var(--gold))",
          color: loading ? "var(--muted)" : "#FFF8E8",
          fontWeight: 700, fontSize: 14, letterSpacing: 1,
          cursor: loading ? "wait" : "pointer",
          marginTop: 4, fontFamily: "'Outfit', sans-serif", transition: "all 0.2s",
        }}>
          {loading ? "Verifying..." : "Enter →"}
        </button>

      </div>
    </div>
  );
}

// ─── MAIN TRACKER APP ─────────────────────────────────────────────────────────
function TrackerApp({ user, onLogout }) {
  const width    = useWindowWidth();
  const isMobile = width < 640;
  const isTablet = width >= 640 && width < 1024;
  const px       = isMobile ? "16px" : isTablet ? "24px" : "32px";

  const [prices, setPrices]           = useState([]);
  const [loading, setLoading]         = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [error, setError]             = useState(null);
  const [useMock, setUseMock]         = useState(false);
  const [countdown, setCountdown]     = useState(REFRESH_INTERVAL / 1000);

  const [buyCommission, setBuyCommission]         = useState(() => storage.get("buyCommission", 0));
  const [buyCommissionType, setBuyCommissionType] = useState(() => storage.get("buyCommissionType", "flat"));
  const [sellCommission, setSellCommission]       = useState(() => storage.get("sellCommission", 0));
  const [sellCommissionType, setSellCommissionType] = useState(() => storage.get("sellCommissionType", "flat"));

  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [adminIn, setAdminIn]               = useState(false);
  const [showUserMenu, setShowUserMenu]     = useState(false);

  const timerRef    = useRef(null);
  const countdownRef = useRef(null);

  const fetchPrices = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      setPrices(await fetchAllPrices());
      setUseMock(false);
      setLastUpdated(new Date());
      setCountdown(REFRESH_INTERVAL / 1000);
    } catch (e) {
      setError(e.message);
      setPrices(getMockData());
      setUseMock(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchPrices();
    timerRef.current = setInterval(fetchPrices, REFRESH_INTERVAL);
    return () => clearInterval(timerRef.current);
  }, [fetchPrices]);

  useEffect(() => {
    countdownRef.current = setInterval(() => setCountdown(c => c > 0 ? c - 1 : REFRESH_INTERVAL / 1000), 1000);
    return () => clearInterval(countdownRef.current);
  }, []);

  function getDataForScrip(s) {
    if (!prices.length) return null;
    // API returns: GOLD = per 10g, SILVER = per kg
    // GOLDM  = Gold Mini  → per 1g   → divide GOLD LTP by 10
    // SILVERM = Silver Mini → per 100g → divide SILVER LTP by 10
    const symbol = s.metal === "gold" ? "GOLD" : "SILVER";
    const base   = prices.find(p => p.Symbol === symbol);
    if (!base) return null;

    if (s.label === "GOLD" || s.label === "SILVER") return base;

    // Scale mini contracts to their unit
    const factor = s.label === "GOLDM" ? 10 : 10; // GOLDM: /10 (10g→1g), SILVERM: /10 (kg→100g)
    return {
      ...base,
      LTP:           parseFloat((base.LTP           / factor).toFixed(2)),
      Open:          parseFloat((base.Open          / factor).toFixed(2)),
      High:          parseFloat((base.High          / factor).toFixed(2)),
      Low:           parseFloat((base.Low           / factor).toFixed(2)),
      PreviousClose: parseFloat((base.PreviousClose / factor).toFixed(2)),
      PerGram:       base.PerGram,
    };
  }



  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", fontFamily: "'Outfit', sans-serif", color: "var(--text)", overflowX: "hidden" }}>
      <style>{GLOBAL_CSS}</style>
      <BgFx />

      {/* ── Topbar ── */}
      <div style={{
        position: "sticky", top: 0, zIndex: 100,
        background: "rgba(13,8,4,0.92)", backdropFilter: "blur(20px)",
        borderBottom: "1px solid var(--border2)",
        padding: `14px ${px}`,
        display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
      }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <RamagoldLogo size={isMobile ? 38 : 48} glow={false} />
          <div>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: isMobile ? 17 : 21, fontWeight: 700, color: "var(--gold-bright)", lineHeight: 1 }}>Ramagold.in</div>
            {!isMobile && <div style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: "var(--muted)", marginTop: 2 }}>Live Gold & Silver Rates</div>}
          </div>
        </div>

        {/* Right controls */}
        <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 6 : 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {/* Live badge */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(92,184,122,0.1)", border: "1px solid rgba(92,184,122,0.25)", color: "var(--buy)", fontSize: 10, letterSpacing: 2, textTransform: "uppercase", padding: "5px 12px", borderRadius: 100, fontWeight: 500 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--buy)", display: "inline-block", animation: error ? "none" : "blink 1.2s ease-in-out infinite", opacity: error ? 0.3 : 1 }} />
            {!isMobile && (error ? "Error" : "Live")}
          </div>

          <button onClick={fetchPrices} disabled={loading} style={{
            background: "transparent", border: "1px solid var(--border2)", color: "var(--muted)",
            padding: isMobile ? "6px 10px" : "6px 14px", borderRadius: 8,
            cursor: "pointer", fontSize: 11, fontFamily: "'Outfit', sans-serif",
            display: "flex", alignItems: "center", gap: 4, transition: "all 0.2s",
          }}>
            {loading ? <Spinner color="var(--muted)" size={12} /> : "↻"}{!isMobile && " Refresh"}
          </button>

          <button onClick={() => adminIn ? setShowAdminPanel(true) : setShowAdminLogin(true)} style={{
            background: "rgba(123,156,222,0.1)", border: "1px solid rgba(123,156,222,0.25)",
            color: "var(--admin)", padding: isMobile ? "6px 10px" : "6px 14px", borderRadius: 100,
            cursor: "pointer", fontSize: 11, fontWeight: 500, letterSpacing: 1,
            display: "flex", alignItems: "center", gap: 6, fontFamily: "'Outfit', sans-serif",
            transition: "all 0.2s",
          }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--admin)", display: "inline-block" }} />
            {isMobile ? "⚙" : "Admin"}
          </button>

          {/* User avatar */}
          <div style={{ position: "relative" }}>
            <button onClick={() => setShowUserMenu(v => !v)} style={{
              display: "flex", alignItems: "center", gap: 8,
              background: "var(--surface2)", border: "1px solid var(--border2)",
              borderRadius: 100, padding: "5px 14px 5px 5px", cursor: "pointer", transition: "border-color 0.2s",
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: "50%",
                background: "linear-gradient(135deg, var(--gold-deep), var(--gold))",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 12, fontWeight: 700, color: "#fff",
              }}>
                {user.name.charAt(0).toUpperCase()}
              </div>
              {!isMobile && <span style={{ fontSize: 12, color: "var(--text)", fontWeight: 500 }}>{user.name.split(" ")[0]}</span>}
            </button>
            {showUserMenu && (
              <div style={{
                position: "absolute", top: "calc(100% + 8px)", right: 0,
                background: "#13100A", border: "1px solid var(--border)", borderRadius: 14,
                padding: 8, minWidth: 170, boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
                zIndex: 200, animation: "modalIn 0.2s ease",
              }}>
                <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border2)", marginBottom: 6 }}>
                  <div style={{ fontSize: 13, color: "var(--text)", fontWeight: 600 }}>{user.name}</div>
                  <div style={{ fontSize: 10, color: "var(--muted)", fontFamily: "monospace", marginTop: 2 }}>{user.phone}</div>
                </div>
                <button onClick={() => { setShowUserMenu(false); onLogout(); }} style={{
                  width: "100%", background: "none", border: "none", color: "var(--sell)",
                  padding: "8px 12px", borderRadius: 8, cursor: "pointer", fontSize: 12,
                  textAlign: "left", fontFamily: "'Outfit', sans-serif", transition: "background 0.2s",
                }}>Sign Out</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Main ── */}
      <div style={{ maxWidth: 740, margin: "0 auto", padding: `0 ${px} ${isMobile ? "20px" : "80px"}`, position: "relative", zIndex: 1 }}>

        {/* Welcome + update strip */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 4, margin: "12px 0 6px" }}>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>
            Welcome back, <span style={{ color: "var(--gold-bright)", fontWeight: 600 }}>{user.name}</span>
          </div>
          {lastUpdated && (
            <div style={{ fontSize: 11, color: "var(--muted2)", fontFamily: "monospace" }}>
              Updated {fmtTime(lastUpdated)} · ↻ {countdown}s
            </div>
          )}
        </div>

        {/* Banners */}
        {useMock && (
          <div style={{ fontSize: 11, color: "var(--gold)", background: "rgba(201,150,58,0.06)", border: "1px solid rgba(201,150,58,0.18)", borderRadius: 10, padding: "10px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ opacity: 0.5 }}>◈</span> Demo mode — live prices unavailable, showing estimated rates
          </div>
        )}
        {error && (
          <div style={{ fontSize: 11, color: "var(--sell)", background: "rgba(224,112,96,0.06)", border: "1px solid rgba(224,112,96,0.15)", borderRadius: 10, padding: "10px 16px", marginBottom: 16 }}>⚠ {error}</div>
        )}

        {/* Rate sections */}
        <MetalSection
          metal="gold" scrips={GOLD_SCRIPS}
          buyCommission={buyCommission} buyCommissionType={buyCommissionType}
          sellCommission={sellCommission} sellCommissionType={sellCommissionType}
          getDataForScrip={getDataForScrip}
        />
        <MetalSection
          metal="silver" scrips={SILVER_SCRIPS}
          buyCommission={buyCommission} buyCommissionType={buyCommissionType}
          sellCommission={sellCommission} sellCommissionType={sellCommissionType}
          getDataForScrip={getDataForScrip}
        />

        {/* Booking card */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: isMobile ? "22px 18px" : "22px 24px", marginTop: 8, marginBottom: 32, position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: "linear-gradient(to right, transparent, rgba(201,150,58,0.3), transparent)" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 14, paddingBottom: 18, marginBottom: 18, borderBottom: "1px solid rgba(201,150,58,0.1)" }}>
            <div style={{
              width: 44, height: 44, borderRadius: "50%", flexShrink: 0,
              background: "linear-gradient(135deg, var(--gold-deep), var(--gold))",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 20, boxShadow: "0 0 16px rgba(201,150,58,0.3)",
            }}>📞</div>
            <div>
              <div style={{ fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: "var(--muted)", marginBottom: 3 }}>For Booking, Call</div>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: isMobile ? 22 : 26, fontWeight: 700, color: "var(--gold-bright)", letterSpacing: 1 }}>777-1-919191</div>
            </div>
          </div>
          <div style={{ fontSize: 10, letterSpacing: 3, textTransform: "uppercase", color: "var(--muted)", marginBottom: 12 }}>Trading Rules</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {["Gold delivery is strictly done on the same day.", "Silver delivery can be customized as per requirement.", "Gold T+2 must be lifted within the specified time frame."].map((rule, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <div style={{ width: 22, height: 22, borderRadius: "50%", flexShrink: 0, background: "rgba(201,150,58,0.1)", border: "1px solid rgba(201,150,58,0.25)", color: "var(--gold)", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</div>
                <div style={{ fontSize: 13, color: "rgba(242,232,216,0.75)", lineHeight: 1.6, paddingTop: 2 }}>{rule}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ textAlign: "center", paddingBottom: 16 }}>
          <div style={{ fontSize: 11, color: "var(--muted2)", letterSpacing: 1 }}>
            Rates subject to market fluctuations &nbsp;•&nbsp; All prices in INR &nbsp;•&nbsp; ramagold.in
          </div>
        </div>
      </div>

      {showAdminLogin && <AdminLoginModal onLogin={() => { setAdminIn(true); setShowAdminLogin(false); setShowAdminPanel(true); }} onClose={() => setShowAdminLogin(false)} />}
      {showAdminPanel && (
        <AdminPanel
          buyCommission={buyCommission} buyCommissionType={buyCommissionType}
          sellCommission={sellCommission} sellCommissionType={sellCommissionType}
          onSave={({ buyCommission: bv, buyCommissionType: bt, sellCommission: sv, sellCommissionType: st }) => {
            setBuyCommission(bv);   storage.set("buyCommission", bv);
            setBuyCommissionType(bt); storage.set("buyCommissionType", bt);
            setSellCommission(sv);  storage.set("sellCommission", sv);
            setSellCommissionType(st); storage.set("sellCommissionType", st);
          }}
          onClose={() => setShowAdminPanel(false)}
        />
      )}
    </div>
  );
}


// ─── Session config ──────────────────────────────────────────────────────────
const SESSION_DURATION_MS = 2 * 60 * 60 * 1000; // 2 hours

function loadValidSession() {
  const user = storage.get("user", null);
  if (!user || !user.loginAt) return null;
  if (Date.now() - user.loginAt > SESSION_DURATION_MS) {
    storage.del("user");
    return null;
  }
  return user;
}

// ─── ROOT APP — handles auth flow ─────────────────────────────────────────────
export default function App() {
  const [user, setUser]             = useState(() => loadValidSession());
  const [otpPending, setOtpPending] = useState(null);

  // Auto-logout timer
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      const timeElapsed = Date.now() - user.loginAt;
      if (timeElapsed >= SESSION_DURATION_MS) {
        storage.del("user");
        setUser(null);
        alert("Your session has expired. Please log in again.");
      }
    }, 60 * 1000);
    return () => clearInterval(interval);
  }, [user]);

  function handleLogout() {
    storage.del("user");
    setUser(null);
    setOtpPending(null);
  }

  if (!user) {
    if (otpPending) {
      return (
        <OtpPage
          userData={otpPending}
          onVerified={(u) => { setUser(u); setOtpPending(null); }}
          onBack={() => setOtpPending(null)}
        />
      );
    }
    return (
      <LoginPage
        onOtpSent={(data) => setOtpPending(data)}
        onDirectLogin={(u) => setUser(u)}
      />
    );
  }

  return <TrackerApp user={user} onLogout={handleLogout} />;
}
