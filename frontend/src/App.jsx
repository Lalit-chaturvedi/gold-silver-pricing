import { useState, useEffect, useCallback, useRef } from "react";

// ─── Config ───────────────────────────────────────────────────────────────────
const OTP_SERVER = "https://fosterdigitalmedia.com"; // Your backend server URL

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

// ─── Fetch prices via backend proxy (avoids CORS) ────────────────────────────
async function fetchAllPrices() {
  const res = await fetch(`${OTP_SERVER}/api/market-feed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      Count:          ALL_SCRIPS.length,
      MarketFeedData: ALL_SCRIPS.map(s => ({
        Exch:      s.Exch,
        ExchType:  s.ExchType,
        ScripCode: s.ScripCode,
        ScripData: "",
      })),
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (!data.success) throw new Error(data.message || "Market feed error");
  return data.data || [];
}

function getMockData() {
  const bases = [73450, 7349, 89200, 8930];
  return ALL_SCRIPS.map((s, i) => ({
    ScripCode: parseInt(s.ScripCode), Exch: s.Exch, ExchType: s.ExchType,
    LastRate: bases[i] + Math.random() * 300 - 150,
    High: bases[i] + 380, Low: bases[i] - 320,
    PClose: bases[i] - 60 + Math.random() * 120,
    TickDt: `/Date(${Date.now()})/`, _mock: true,
  }));
}

// ─── Global CSS ───────────────────────────────────────────────────────────────
const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600;700&display=swap');
  @keyframes spin    { to { transform: rotate(360deg); } }
  @keyframes pulse   { 0%,100%{opacity:1} 50%{opacity:0.25} }
  @keyframes cardIn  { from { opacity:0; transform:translateY(18px); } to { opacity:1; transform:translateY(0); } }
  @keyframes modalIn { from { opacity:0; transform:scale(0.95) translateY(-10px); } to { opacity:1; transform:scale(1) translateY(0); } }
  @keyframes floatOrb { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-18px)} }
  @keyframes fadeUp  { from { opacity:0; transform:translateY(24px); } to { opacity:1; transform:translateY(0); } }
  @keyframes shake   { 0%,100%{transform:translateX(0)} 20%,60%{transform:translateX(-6px)} 40%,80%{transform:translateX(6px)} }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  .price-card { animation: cardIn 0.5s cubic-bezier(.2,.8,.2,1) both; }
  .price-card:hover { transform: translateY(-4px); box-shadow: 0 16px 48px rgba(0,0,0,0.5); }
  input:focus { border-color: #C9A84C !important; box-shadow: 0 0 0 2px #C9A84C10; }
  input::placeholder { color: #2A3A4A; }
  .otp-input { text-align: center; letter-spacing: 8px; font-size: 24px !important; font-family: monospace !important; }
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: #020408; }
  ::-webkit-scrollbar-thumb { background: #0E1828; border-radius: 10px; }
  .shake { animation: shake 0.4s ease; }
`;

// ─── Shared UI pieces ─────────────────────────────────────────────────────────
function Spinner({ color = "#C9A84C", size = 16 }) {
  return (
    <span style={{ display: "inline-block", width: size, height: size, verticalAlign: "middle" }}>
      <svg viewBox="0 0 24 24" style={{ animation: "spin 1s linear infinite", display: "block" }}>
        <circle cx="12" cy="12" r="10" fill="none" stroke={color} strokeWidth="3" strokeDasharray="31" strokeDashoffset="10" />
      </svg>
    </span>
  );
}

function BgOrbs() {
  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "hidden" }}>
      <div style={{
        position: "absolute", top: "-15%", left: "-5%", width: "60vw", height: "60vw",
        maxWidth: 700, maxHeight: 700, borderRadius: "50%",
        background: "radial-gradient(circle, #C9A84C06 0%, transparent 55%)",
        animation: "floatOrb 14s ease-in-out infinite",
      }} />
      <div style={{
        position: "absolute", bottom: "0%", right: "-5%", width: "50vw", height: "50vw",
        maxWidth: 600, maxHeight: 600, borderRadius: "50%",
        background: "radial-gradient(circle, #5080A006 0%, transparent 55%)",
        animation: "floatOrb 18s ease-in-out infinite reverse",
      }} />
    </div>
  );
}

// ─── LOGIN PAGE ───────────────────────────────────────────────────────────────
function LoginPage({ onOtpSent }) {
  const [name, setName]       = useState("");
  const [phone, setPhone]     = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  async function handleSend() {
    setError("");
    const cleanPhone = phone.replace(/\D/g, "");
    if (!name.trim()) { setError("Please enter your name."); return; }
    if (!/^[6-9]\d{9}$/.test(cleanPhone)) { setError("Enter a valid 10-digit Indian mobile number."); return; }

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
    <div style={{
      minHeight: "100vh", background: "#04070D",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 20, position: "relative",
    }}>
      <style>{GLOBAL_CSS}</style>
      <BgOrbs />

      <div style={{
        position: "relative", zIndex: 1, width: "100%", maxWidth: 420,
        animation: "fadeUp 0.6s cubic-bezier(.2,.8,.2,1)",
      }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontSize: 32, fontWeight: 700, letterSpacing: 6, marginBottom: 8,
            background: "linear-gradient(100deg, #C9A847, #ECC84A, #8BACC0)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>
            GOLD · SILVER
          </div>
          <div style={{ fontSize: 10, color: "#506878", letterSpacing: 4 }}>MCX LIVE MARKET RATES</div>
        </div>

        {/* Card */}
        <div style={{
          background: "linear-gradient(160deg, #090E18, #060A12)",
          border: "1px solid #1A2A3A",
          borderRadius: 24, padding: "36px 32px",
          boxShadow: "0 40px 100px #000000AA",
        }}>
          {/* top shimmer */}
          <div style={{
            position: "absolute", top: 0, left: "10%", right: "10%", height: 1,
            background: "linear-gradient(90deg, transparent, #C9A84C50, transparent)",
            borderRadius: 1,
          }} />

          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 9, color: "#506878", letterSpacing: 4, marginBottom: 6 }}>WELCOME</div>
            <div style={{
              fontFamily: "'Cormorant Garamond', Georgia, serif",
              fontSize: 24, fontWeight: 700, color: "#C0C8D0",
            }}>Sign In</div>
            <div style={{ fontSize: 11, color: "#3A5060", marginTop: 6 }}>
              Enter your details to receive an OTP
            </div>
          </div>

          {/* Name field */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 9, color: "#506878", letterSpacing: 2.5, fontWeight: 700, marginBottom: 8 }}>
              FULL NAME
            </div>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Rajesh Kumar"
              style={{
                width: "100%", background: "#040609", border: "1px solid #1A2A3A",
                borderRadius: 10, padding: "13px 16px", color: "#C0C8D0", fontSize: 14,
                outline: "none", fontFamily: "inherit", transition: "border-color 0.2s",
              }}
            />
          </div>

          {/* Phone field */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 9, color: "#506878", letterSpacing: 2.5, fontWeight: 700, marginBottom: 8 }}>
              MOBILE NUMBER
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <div style={{
                background: "#040609", border: "1px solid #1A2A3A",
                borderRadius: 10, padding: "13px 14px",
                color: "#506878", fontSize: 14, flexShrink: 0,
                display: "flex", alignItems: "center", gap: 6,
              }}>
                🇮🇳 +91
              </div>
              <input
                value={phone}
                onChange={e => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                placeholder="9876543210"
                type="tel"
                onKeyDown={e => e.key === "Enter" && handleSend()}
                style={{
                  flex: 1, background: "#040609", border: "1px solid #1A2A3A",
                  borderRadius: 10, padding: "13px 16px", color: "#C0C8D0", fontSize: 14,
                  outline: "none", fontFamily: "monospace", transition: "border-color 0.2s",
                  letterSpacing: 2,
                }}
              />
            </div>
          </div>

          {/* Error */}
          {error && (
            <div style={{
              background: "#F0606810", border: "1px solid #F0606830",
              borderRadius: 8, padding: "10px 14px", marginBottom: 20,
              fontSize: 12, color: "#F09090",
            }}>
              {error}
            </div>
          )}

          {/* Button */}
          <button
            onClick={handleSend}
            disabled={loading}
            style={{
              width: "100%", padding: "14px",
              background: loading ? "#1A2A3A" : "linear-gradient(135deg, #C9A84C, #ECC84A)",
              border: "none", borderRadius: 12,
              color: loading ? "#506878" : "#1A0E00",
              fontWeight: 900, fontSize: 14, cursor: loading ? "wait" : "pointer",
              transition: "all 0.3s", fontFamily: "inherit", letterSpacing: 1,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}
          >
            {loading ? <><Spinner color="#506878" /> Sending OTP...</> : "Send OTP →"}
          </button>

          <div style={{ marginTop: 16, fontSize: 10, color: "#2A3A4A", textAlign: "center" }}>
            An OTP will be sent to your mobile via SMS
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── OTP VERIFICATION PAGE ────────────────────────────────────────────────────
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
    <div style={{
      minHeight: "100vh", background: "#04070D",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 20, position: "relative",
    }}>
      <style>{GLOBAL_CSS}</style>
      <BgOrbs />

      <div style={{
        position: "relative", zIndex: 1, width: "100%", maxWidth: 420,
        animation: "fadeUp 0.5s cubic-bezier(.2,.8,.2,1)",
      }}>
        {/* Back */}
        <button onClick={onBack} style={{
          background: "none", border: "none", color: "#3A5060",
          cursor: "pointer", fontSize: 12, marginBottom: 24, padding: 0,
          display: "flex", alignItems: "center", gap: 6, letterSpacing: 1,
          fontFamily: "inherit",
        }}>
          ← Back
        </button>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontSize: 32, fontWeight: 700, letterSpacing: 6, marginBottom: 8,
            background: "linear-gradient(100deg, #C9A847, #ECC84A, #8BACC0)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>
            GOLD · SILVER
          </div>
        </div>

        {/* Card */}
        <div style={{
          background: "linear-gradient(160deg, #090E18, #060A12)",
          border: "1px solid #1A2A3A",
          borderRadius: 24, padding: "36px 32px",
          boxShadow: "0 40px 100px #000000AA",
        }}>
          {/* Icon */}
          <div style={{
            width: 56, height: 56, borderRadius: 16, margin: "0 auto 24px",
            background: "linear-gradient(135deg, #C9A84C18, #C9A84C30)",
            border: "1px solid #C9A84C30",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24,
          }}>📱</div>

          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <div style={{ fontSize: 9, color: "#506878", letterSpacing: 4, marginBottom: 6 }}>VERIFICATION</div>
            <div style={{
              fontFamily: "'Cormorant Garamond', Georgia, serif",
              fontSize: 24, fontWeight: 700, color: "#C0C8D0", marginBottom: 10,
            }}>Enter OTP</div>
            <div style={{ fontSize: 12, color: "#3A5060", lineHeight: 1.6 }}>
              Hi <span style={{ color: "#C9A84C" }}>{userData.name}</span>, we sent a 6-digit OTP to<br />
              <span style={{ color: "#607888", fontFamily: "monospace" }}>{maskedPhone}</span>
            </div>
          </div>

          {/* OTP Input */}
          <div style={{ marginBottom: 24 }}>
            <input
              ref={inputRef}
              value={otp}
              onChange={e => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              onKeyDown={e => e.key === "Enter" && handleVerify()}
              placeholder="••••••"
              type="tel"
              className={`otp-input${shaking ? " shake" : ""}`}
              style={{
                width: "100%", background: "#040609",
                border: `1px solid ${error ? "#F06060" : "#1A2A3A"}`,
                borderRadius: 12, padding: "16px",
                color: "#F5E199", fontSize: 28,
                outline: "none", fontFamily: "monospace",
                transition: "border-color 0.2s",
                textAlign: "center", letterSpacing: 10,
              }}
            />
          </div>

          {/* Error */}
          {error && (
            <div style={{
              background: "#F0606810", border: "1px solid #F0606830",
              borderRadius: 8, padding: "10px 14px", marginBottom: 20,
              fontSize: 12, color: "#F09090", textAlign: "center",
            }}>
              {error}
            </div>
          )}

          {/* Verify button */}
          <button
            onClick={handleVerify}
            disabled={loading || otp.length !== 6}
            style={{
              width: "100%", padding: "14px",
              background: otp.length === 6 && !loading
                ? "linear-gradient(135deg, #C9A84C, #ECC84A)"
                : "#0A1420",
              border: "none", borderRadius: 12,
              color: otp.length === 6 && !loading ? "#1A0E00" : "#2A3A4A",
              fontWeight: 900, fontSize: 14,
              cursor: otp.length === 6 && !loading ? "pointer" : "not-allowed",
              transition: "all 0.3s", fontFamily: "inherit", letterSpacing: 1,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}
          >
            {loading ? <><Spinner color="#506878" /> Verifying...</> : "Verify OTP ✓"}
          </button>

          {/* Resend */}
          <div style={{ marginTop: 20, textAlign: "center" }}>
            {resendTimer > 0 ? (
              <span style={{ fontSize: 12, color: "#2A3A4A" }}>
                Resend OTP in <span style={{ color: "#C9A84C", fontFamily: "monospace" }}>{resendTimer}s</span>
              </span>
            ) : (
              <button
                onClick={handleResend}
                disabled={resending}
                style={{
                  background: "none", border: "none", color: "#C9A84C",
                  cursor: resending ? "wait" : "pointer", fontSize: 12,
                  fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6,
                }}
              >
                {resending ? <><Spinner color="#C9A84C" size={12} /> Sending...</> : "Resend OTP"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── PRICE ROW — Buy/Sell layout matching the design ─────────────────────────
function PriceRow({ scrip, data, buyCommission, buyCommissionType, sellCommission, sellCommissionType, idx }) {
  const isGold    = scrip.metal === "gold";
  const ltp       = data?.LastRate ?? 0;
  const pclose    = data?.PClose ?? 0;
  const change    = ltp - pclose;
  const changePct = pclose ? (change / pclose) * 100 : 0;
  const isUp      = change >= 0;
  const tickDate  = parseTickDate(data?.TickDt);

  const accent     = isGold ? "#D4A847" : "#8BACC0";
  const accentText = isGold ? "#F5E199" : "#C8DCF0";

  // Buy = LTP - buyCommission (cheaper for buyer)
  const buyCommVal  = buyCommissionType  === "percent" ? ltp * (buyCommission  / 100) : buyCommission;
  const sellCommVal = sellCommissionType === "percent" ? ltp * (sellCommission / 100) : sellCommission;
  const buyPrice    = Math.max(0, ltp - buyCommVal);
  const sellPrice   = ltp + sellCommVal;

  return (
    <div className="price-card" style={{
      background: isGold
        ? "linear-gradient(160deg, #131008 0%, #1C1408 100%)"
        : "linear-gradient(160deg, #0A1018 0%, #0E1A26 100%)",
      border: `1px solid ${accent}22`,
      borderRadius: 16, padding: "20px 22px",
      position: "relative", overflow: "hidden",
      transition: "transform 0.3s ease, box-shadow 0.3s ease",
      animationDelay: `${idx * 0.08}s`,
      borderLeft: `3px solid ${accent}80`,
    }}>
      {/* top shimmer */}
      <div style={{ position: "absolute", top: 0, left: "5%", right: "5%", height: 1, background: `linear-gradient(90deg, transparent, ${accent}40, transparent)` }} />

      {data?._mock && (
        <span style={{
          position: "absolute", top: 10, right: 10, fontSize: 7, color: "#2A2A2A",
          background: "#111", border: "1px solid #222", padding: "2px 7px", borderRadius: 20, letterSpacing: 2,
        }}>DEMO</span>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", alignItems: "center", gap: 12 }}>

        {/* ── Left: Product info ── */}
        <div>
          <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 20, fontWeight: 700, color: accentText, letterSpacing: 1 }}>
            {scrip.productLabel || scrip.label}
          </div>
          <div style={{
            display: "inline-block", marginTop: 6,
            background: `${accent}15`, border: `1px solid ${accent}30`,
            borderRadius: 5, padding: "2px 8px",
            fontSize: 10, color: accent + "CC", letterSpacing: 1, fontWeight: 700,
          }}>
            {scrip.sublabel}
          </div>
          <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{
              fontSize: 10, fontWeight: 700,
              color: isUp ? "#5FD988" : "#F07070",
            }}>
              {isUp ? "▲" : "▼"} {fmt(Math.abs(changePct))}%
            </span>
            {tickDate && <span style={{ fontSize: 9, color: "#2A3A4A", fontFamily: "monospace" }}>· {fmtTime(tickDate)}</span>}
          </div>
        </div>

        {/* ── Middle: BUY ── */}
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 8, color: "#5FD98880", letterSpacing: 3, fontWeight: 700, marginBottom: 6 }}>BUY</div>
          <div style={{
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontSize: "clamp(20px, 2.5vw, 28px)", fontWeight: 700,
            color: "#5FD988", lineHeight: 1, fontVariantNumeric: "tabular-nums",
          }}>
            ₹{fmt(buyPrice)}
          </div>
          <div style={{ fontSize: 9, color: "#3A5040", marginTop: 4 }}>per unit</div>
        </div>

        {/* ── Right: SELL ── */}
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 8, color: "#F0707080", letterSpacing: 3, fontWeight: 700, marginBottom: 6 }}>SELL</div>
          <div style={{
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontSize: "clamp(20px, 2.5vw, 28px)", fontWeight: 700,
            color: "#F07070", lineHeight: 1, fontVariantNumeric: "tabular-nums",
          }}>
            ₹{fmt(sellPrice)}
          </div>
          <div style={{ fontSize: 9, color: "#503A3A", marginTop: 4 }}>per unit</div>
        </div>
      </div>
    </div>
  );
}

// ─── METAL SECTION — header row + price rows ──────────────────────────────────
function MetalSection({ metal, scrips, buyCommission, buyCommissionType, sellCommission, sellCommissionType, getDataForScrip }) {
  const isGold = metal === "gold";
  const accent = isGold ? "#D4A847" : "#8BACC0";
  return (
    <div style={{ marginBottom: 40 }}>
      {/* Section header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <div style={{
          width: 7, height: 7, borderRadius: "50%",
          border: `2px solid ${accent}80`, background: "transparent", flexShrink: 0,
        }} />
        <div style={{ fontSize: 9, color: accent + "99", letterSpacing: 5, fontWeight: 700 }}>
          {isGold ? "GOLD RATES" : "SILVER RATES"}
        </div>
        <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${accent}30, transparent)` }} />
      </div>

      {/* Column headers */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
        padding: "0 22px", marginBottom: 8,
      }}>
        <div style={{ fontSize: 8, color: "#2A3A4A", letterSpacing: 3, fontWeight: 700 }}>PRODUCT</div>
        <div style={{ fontSize: 8, color: "#2A3A4A", letterSpacing: 3, fontWeight: 700, textAlign: "center" }}>BUY</div>
        <div style={{ fontSize: 8, color: "#2A3A4A", letterSpacing: 3, fontWeight: 700, textAlign: "center" }}>SELL</div>
      </div>

      {/* Rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {scrips.map((scrip, i) => (
          <PriceRow
            key={scrip.ScripCode}
            scrip={scrip}
            data={getDataForScrip(scrip)}
            buyCommission={buyCommission}
            buyCommissionType={buyCommissionType}
            sellCommission={sellCommission}
            sellCommissionType={sellCommissionType}
            idx={i}
          />
        ))}
      </div>
    </div>
  );
}

// ─── ADMIN PANEL ──────────────────────────────────────────────────────────────
function CommissionField({ label, color, value, type, onValueChange, onTypeChange }) {
  const inputStyle = {
    width: "100%", background: "#040609", border: "1px solid #1A2A3A",
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
            color: type === t ? color : "#506878",
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
        background: "linear-gradient(160deg, #090E18, #060A12)",
        border: "1px solid #1A2A3A", borderRadius: 22,
        padding: "32px 28px", width: "100%", maxWidth: 480,
        boxShadow: "0 40px 120px #000000AA",
        animation: "modalIn 0.3s cubic-bezier(.2,.8,.2,1)",
        maxHeight: "90vh", overflowY: "auto",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 9, color: "#506878", letterSpacing: 3, marginBottom: 5 }}>CONFIGURATION</div>
            <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 22, fontWeight: 700, color: "#8090A0" }}>Admin Settings</div>
          </div>
          <button onClick={onClose} style={{ width: 36, height: 36, borderRadius: "50%", border: "1px solid #1A2A3A", background: "none", color: "#506878", cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>

        {/* API info banner */}
        <div style={{
          background: "#0A1E10", border: "1px solid #1A3A20", borderRadius: 10,
          padding: "12px 16px", marginBottom: 22, fontSize: 11, color: "#4A8A5A", lineHeight: 1.6,
        }}>
          🔑 <strong style={{ color: "#5FD988" }}>API keys are managed on the server.</strong><br />
          Set <code style={{ color: "#C9A84C" }}>FIVE_PAISA_KEY</code> and <code style={{ color: "#C9A84C" }}>FIVE_PAISA_TOKEN</code> in your <code style={{ color: "#C9A84C" }}>.env</code> file.
        </div>

        <div style={{ fontSize: 8, color: "#506878", letterSpacing: 3, marginBottom: 14, fontWeight: 700 }}>COMMISSION SETTINGS</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 18 }}>
          <CommissionField
            label="BUY COMMISSION (deducted from price)"
            color="#5FD988"
            value={bc} type={bt}
            onValueChange={setBc} onTypeChange={setBt}
          />
          <CommissionField
            label="SELL COMMISSION (added to price)"
            color="#F07070"
            value={sc} type={st}
            onValueChange={setSc} onTypeChange={setSt}
          />
        </div>

        {err && <div style={{ color: "#F07070", fontSize: 11, marginBottom: 10 }}>{err}</div>}
        <button onClick={save} style={{
          width: "100%", padding: "13px", borderRadius: 11, cursor: "pointer",
          background: saved ? "#0D2016" : "linear-gradient(135deg, #C9A84C, #ECC84A)",
          border: saved ? "1px solid #1D4828" : "none",
          color: saved ? "#5FD988" : "#1A0E00",
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
    width: "100%", background: "#040609", border: "1px solid #1A2A3A",
    borderRadius: 9, padding: "11px 13px", color: "#7090A8", fontSize: 14,
    outline: "none", fontFamily: "inherit", boxSizing: "border-box",
  };
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000, background: "#000000B0", backdropFilter: "blur(10px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }} onClick={e => e.target === e.currentTarget && onClose?.()}>
      <div style={{
        background: "linear-gradient(160deg, #090E18, #060A12)",
        border: "1px solid #1A2A3A", borderRadius: 22,
        padding: "40px 28px", width: "100%", maxWidth: 360,
        boxShadow: "0 40px 120px #000000AA",
        animation: "modalIn 0.3s cubic-bezier(.2,.8,.2,1)", textAlign: "center",
      }}>
        <div style={{ fontSize: 9, color: "#506878", letterSpacing: 4, marginBottom: 6 }}>RESTRICTED</div>
        <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 22, fontWeight: 700, color: "#8090A0", marginBottom: 28 }}>Admin Access</div>
        <div style={{ textAlign: "left", marginBottom: 14 }}>
          <div style={{ fontSize: 9, color: "#506878", letterSpacing: 2, marginBottom: 7 }}>USERNAME</div>
          <input value={u} onChange={e => setU(e.target.value)} placeholder="admin" style={inputStyle} />
        </div>
        <div style={{ textAlign: "left", marginBottom: 14 }}>
          <div style={{ fontSize: 9, color: "#506878", letterSpacing: 2, marginBottom: 7 }}>PASSWORD</div>
          <input value={p} onChange={e => setP(e.target.value)} placeholder="••••••••" type="password"
            onKeyDown={e => e.key === "Enter" && go()} style={inputStyle} />
        </div>
        {err && <div style={{ color: "#F07070", fontSize: 11, marginBottom: 10 }}>{err}</div>}
        <button onClick={go} disabled={loading} style={{
          width: "100%", padding: "12px", borderRadius: 10, border: "none",
          background: "linear-gradient(135deg, #C9A84C, #ECC84A)",
          color: "#1A0E00", fontWeight: 900, fontSize: 14,
          cursor: loading ? "wait" : "pointer", opacity: loading ? 0.7 : 1,
          marginTop: 4, fontFamily: "inherit",
        }}>
          {loading ? "Verifying..." : "Enter"}
        </button>
        <div style={{ marginTop: 14, fontSize: 10, color: "#2A3A4A" }}>admin / admin@123</div>
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
    return prices.find(p => String(p.Token) === s.ScripCode || String(p.ScripCode) === s.ScripCode) || prices[ALL_SCRIPS.indexOf(s)];
  }



  return (
    <div style={{ minHeight: "100vh", background: "#04070D", fontFamily: "'Georgia', 'Palatino Linotype', serif", color: "#6080A0", overflowX: "hidden" }}>
      <style>{GLOBAL_CSS}</style>
      <BgOrbs />

      {/* ── Header ── */}
      <div style={{
        position: "sticky", top: 0, zIndex: 100,
        background: "#04070DF4", backdropFilter: "blur(28px)",
        borderBottom: "1px solid #0A1828",
        padding: `14px ${px}`,
        display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
      }}>
        <div style={{ flexShrink: 0 }}>
          <div style={{
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontSize: isMobile ? 16 : 20, fontWeight: 700, letterSpacing: isMobile ? 4 : 6,
            background: "linear-gradient(100deg, #C9A847CC, #ECC84ACC, #8BACC0CC)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>GOLD · SILVER</div>
          {!isMobile && <div style={{ fontSize: 8, color: "#506878", letterSpacing: 4, marginTop: 3 }}>MCX LIVE MARKET RATES</div>}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 8 : 12 }}>
          {/* Live dot */}
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{
              width: 6, height: 6, borderRadius: "50%",
              background: error ? "#F07070" : "#5FD988",
              boxShadow: `0 0 7px ${error ? "#F0707055" : "#5FD98855"}`,
              animation: "pulse 2s ease-in-out infinite",
            }} />
            {!isMobile && <span style={{ fontSize: 8, color: "#506878", letterSpacing: 2.5, fontFamily: "monospace" }}>{error ? "ERROR" : "LIVE"}</span>}
          </div>

          <button onClick={fetchPrices} disabled={loading} style={{
            background: "none", border: "1px solid #1A2A3A", color: "#506878",
            padding: isMobile ? "6px 10px" : "7px 14px", borderRadius: 8,
            cursor: "pointer", fontSize: 11, fontFamily: "inherit",
            display: "flex", alignItems: "center", gap: 4, transition: "all 0.2s",
          }}>
            {loading ? <Spinner color="#506878" size={12} /> : "↻"}{!isMobile && " Refresh"}
          </button>

          <button onClick={() => adminIn ? setShowAdminPanel(true) : setShowAdminLogin(true)} style={{
            background: "#C9A84708", border: "1px solid #C9A84728",
            color: "#C9A84C", padding: isMobile ? "6px 10px" : "7px 14px", borderRadius: 8,
            cursor: "pointer", fontSize: 11, fontWeight: 700, letterSpacing: 1,
            transition: "all 0.2s", fontFamily: "inherit",
          }}>
            {isMobile ? "⚙" : "ADMIN"}
          </button>

          {/* User avatar / logout */}
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setShowUserMenu(v => !v)}
              style={{
                background: "linear-gradient(135deg, #1A2A3A, #0E1828)",
                border: "1px solid #2A3A4A", borderRadius: 8,
                color: "#8BACC0", padding: isMobile ? "6px 10px" : "7px 14px",
                cursor: "pointer", fontSize: 11, fontFamily: "inherit",
                display: "flex", alignItems: "center", gap: 6, transition: "all 0.2s",
              }}>
              👤 {!isMobile && user.name.split(" ")[0]}
            </button>
            {showUserMenu && (
              <div style={{
                position: "absolute", top: "calc(100% + 8px)", right: 0,
                background: "linear-gradient(160deg, #090E18, #060A12)",
                border: "1px solid #1A2A3A", borderRadius: 12,
                padding: "8px", minWidth: 160, boxShadow: "0 20px 60px #000000AA",
                zIndex: 200, animation: "modalIn 0.2s ease",
              }}>
                <div style={{ padding: "8px 12px", borderBottom: "1px solid #0A1828", marginBottom: 6 }}>
                  <div style={{ fontSize: 12, color: "#8090A0", fontWeight: 700 }}>{user.name}</div>
                  <div style={{ fontSize: 10, color: "#3A5060", fontFamily: "monospace", marginTop: 2 }}>
                    {user.phone}
                  </div>
                </div>
                <button onClick={() => { setShowUserMenu(false); onLogout(); }} style={{
                  width: "100%", background: "none", border: "none",
                  color: "#F07070", padding: "8px 12px", borderRadius: 8,
                  cursor: "pointer", fontSize: 12, textAlign: "left",
                  fontFamily: "inherit", transition: "background 0.2s",
                }}>
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Main ── */}
      <div style={{ maxWidth: "100%", padding: `${isMobile ? 28 : 44}px ${px} 80px`, position: "relative", zIndex: 1 }}>

        {/* Welcome strip */}
        <div style={{
          background: "linear-gradient(135deg, #0C1828, #081018)",
          border: "1px solid #1A2A3A", borderRadius: 12,
          padding: "14px 20px", marginBottom: 28,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexWrap: "wrap", gap: 10,
        }}>
          <div style={{ fontSize: 13, color: "#607888" }}>
            Welcome back, <span style={{ color: "#C9A84C", fontWeight: 700 }}>{user.name}</span>
          </div>
          {lastUpdated && (
            <div style={{ fontSize: 10, color: "#3A5060", fontFamily: "monospace" }}>
              Updated {fmtTime(lastUpdated)} · ↻ {countdown}s
            </div>
          )}
        </div>

        {/* Banners */}
        {useMock && (
          <div style={{ fontSize: 11, color: "#7A6020", background: "#C9A84708", border: "1px solid #C9A84718", borderRadius: 10, padding: "10px 16px", marginBottom: 24, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ opacity: 0.5 }}>◈</span> Demo mode — set FIVE_PAISA_KEY in your server .env file for live data
          </div>
        )}
        {error && (
          <div style={{ fontSize: 11, color: "#805050", background: "#F0606806", border: "1px solid #F0606815", borderRadius: 10, padding: "10px 16px", marginBottom: 24 }}>⚠ {error}</div>
        )}

        {/* Gold & Silver sections — no tabs, always show both */}
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

        {/* ── Booking & Trading Rules Card ── */}
        <div style={{
          background: "linear-gradient(160deg, #0C1220, #080E18)",
          border: "1px solid #1A2A3A", borderRadius: 20,
          padding: isMobile ? "24px 20px" : "28px 32px",
          marginTop: 8, marginBottom: 32,
        }}>
          {/* Phone booking */}
          <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 24 }}>
            <div style={{
              width: 54, height: 54, borderRadius: 14, flexShrink: 0,
              background: "linear-gradient(135deg, #C9A84C, #ECC84A)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 22, boxShadow: "0 8px 24px #C9A84C30",
            }}>📞</div>
            <div>
              <div style={{ fontSize: 9, color: "#506878", letterSpacing: 4, marginBottom: 5 }}>FOR BOOKING, CALL</div>
              <div style={{
                fontFamily: "'Cormorant Garamond', Georgia, serif",
                fontSize: isMobile ? 24 : 30, fontWeight: 700, letterSpacing: 2,
                background: "linear-gradient(90deg, #C9A847, #ECC84A)",
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              }}>777-1-919191</div>
            </div>
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: "linear-gradient(90deg, #1A2A3A, #0A1420, #1A2A3A)", marginBottom: 24 }} />

          {/* Trading Rules */}
          <div style={{ fontSize: 9, color: "#3A5060", letterSpacing: 4, fontWeight: 700, marginBottom: 16 }}>TRADING RULES</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {[
              "Gold delivery is strictly done on the same day.",
              "Silver delivery can be customized as per requirement.",
              "Gold T+2 must be lifted within the specified time frame.",
            ].map((rule, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                <div style={{
                  width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
                  background: "linear-gradient(135deg, #C9A84C22, #C9A84C38)",
                  border: "1px solid #C9A84C40",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 700, color: "#C9A84C",
                }}>{i + 1}</div>
                <div style={{ fontSize: 13, color: "#7090A0", lineHeight: 1.6, paddingTop: 3 }}>{rule}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom disclaimer */}
        <div style={{ textAlign: "center", paddingBottom: 16 }}>
          <div style={{ fontSize: 10, color: "#2A3A4A" }}>
            Rates are subject to market fluctuations &nbsp;•&nbsp; All prices in INR
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

  // Auto-logout timer — checks every minute if session has expired
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      const timeElapsed = Date.now() - user.loginAt;
      if (timeElapsed >= SESSION_DURATION_MS) {
        storage.del("user");
        setUser(null);
        alert("Your session has expired. Please log in again.");
      }
    }, 60 * 1000); // check every 60 seconds
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
    return <LoginPage onOtpSent={(data) => setOtpPending(data)} />;
  }

  return <TrackerApp user={user} onLogout={handleLogout} />;
}
