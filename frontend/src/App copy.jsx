import { useState, useEffect, useCallback, useRef } from "react";

// ─── Config ───────────────────────────────────────────────────────────────────
const API_URL       = "https://Openapi.5paisa.com/VendorsAPI/Service1.svc/V1/MarketFeed";
const OTP_SERVER    = "http://localhost:4000"; // Change to your server URL in production

const GOLD_SCRIPS = [
  { label: "GOLD",  sublabel: "Standard Contract", Exch: "M", ExchType: "D", ScripCode: "57592", unit: "10g",  metal: "gold" },
  { label: "GOLDM", sublabel: "Mini Contract",     Exch: "M", ExchType: "D", ScripCode: "57607", unit: "1g",   metal: "gold" },
];
const SILVER_SCRIPS = [
  { label: "SILVER",  sublabel: "Standard Contract", Exch: "M", ExchType: "D", ScripCode: "57630", unit: "1kg",  metal: "silver" },
  { label: "SILVERM", sublabel: "Mini Contract",     Exch: "M", ExchType: "D", ScripCode: "57631", unit: "100g", metal: "silver" },
];
const ALL_SCRIPS = [...GOLD_SCRIPS, ...SILVER_SCRIPS];
const ADMIN_CREDENTIALS = { username: "admin", password: "admin@123" };
const REFRESH_INTERVAL  = 30000;
const OTP_RESEND_COOLDOWN = 30; // seconds

// ─── Storage ──────────────────────────────────────────────────────────────────
const storage = {
  get: (k, d) => { try { const v = sessionStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set: (k, v) => { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del: (k)    => { try { sessionStorage.removeItem(k); } catch {} },
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

// ─── Mock price data ──────────────────────────────────────────────────────────
async function fetchAllPrices(apiKey, accessToken) {
  const body = {
    head: { key: apiKey },
    body: {
      Count: ALL_SCRIPS.length,
      MarketFeedData: ALL_SCRIPS.map(s => ({ Exch: s.Exch, ExchType: s.ExchType, ScripCode: s.ScripCode, ScripData: "" })),
      ClientLoginType: 0, LastRequestTime: "/Date(0)/", RefreshRate: "H",
    },
  };
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(accessToken ? { Authorization: `bearer ${accessToken}` } : {}) },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data?.body?.Status !== 0 && data?.body?.Status !== undefined) throw new Error(data?.body?.Message || "API error");
  return data?.body?.Data || [];
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
      // Save session
      storage.set("user", data.user);
      onVerified(data.user);
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

// ─── PRICE CARD ───────────────────────────────────────────────────────────────
function PriceCard({ scrip, data, commission, commissionType, idx }) {
  const isGold     = scrip.metal === "gold";
  const ltp        = data?.LastRate ?? 0;
  const pclose     = data?.PClose ?? 0;
  const change     = ltp - pclose;
  const changePct  = pclose ? (change / pclose) * 100 : 0;
  const isUp       = change >= 0;
  const commVal    = commissionType === "percent" ? ltp * (commission / 100) : commission;
  const finalPrice = ltp + commVal;
  const tickDate   = parseTickDate(data?.TickDt);

  const accent     = isGold ? "#D4A847" : "#8BACC0";
  const accentText = isGold ? "#F5E199" : "#C8DCF0";
  const upColor    = "#5FD988";
  const downColor  = "#F07070";

  return (
    <div className="price-card" style={{
      background: isGold
        ? "linear-gradient(160deg, #181008 0%, #221808 60%, #14100A 100%)"
        : "linear-gradient(160deg, #0A1018 0%, #101C28 60%, #08101A 100%)",
      border: `1px solid ${accent}28`,
      borderRadius: 20, padding: "28px 24px",
      position: "relative", overflow: "hidden",
      transition: "transform 0.3s ease, box-shadow 0.3s ease",
      animationDelay: `${idx * 0.1}s`, width: "100%",
    }}>
      <div style={{
        position: "absolute", top: 0, left: "10%", right: "10%", height: 1,
        background: `linear-gradient(90deg, transparent, ${accent}60, transparent)`,
      }} />
      <div style={{
        position: "absolute", top: -60, right: -60, width: 180, height: 180, borderRadius: "50%",
        background: `radial-gradient(circle, ${accent}10 0%, transparent 70%)`, pointerEvents: "none",
      }} />

      {data?._mock && (
        <span style={{
          position: "absolute", top: 14, right: 14, fontSize: 8, color: "#2A2A2A",
          background: "#111", border: "1px solid #222", padding: "2px 8px", borderRadius: 20, letterSpacing: 2,
        }}>DEMO</span>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 22, fontWeight: 700, color: accentText, letterSpacing: 1.5 }}>
            {scrip.label}
          </div>
          <div style={{ fontSize: 11, color: accent + "80", letterSpacing: 2, marginTop: 6 }}>
            {scrip.sublabel} &nbsp;·&nbsp; per {scrip.unit}
          </div>
        </div>
        <div style={{
          fontSize: 12, fontWeight: 700, color: isUp ? upColor : downColor,
          background: isUp ? "#0D2016" : "#200D0D",
          border: `1px solid ${isUp ? "#1A4828" : "#481A1A"}`,
          padding: "5px 11px", borderRadius: 8, whiteSpace: "nowrap",
        }}>
          {isUp ? "▲" : "▼"} {fmt(Math.abs(changePct))}%
        </div>
      </div>

      <div style={{ height: 1, background: `${accent}18`, marginBottom: 20 }} />

      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 9, color: accent + "60", letterSpacing: 3, marginBottom: 8, fontWeight: 700 }}>MARKET PRICE</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
          <span style={{ fontSize: 18, color: accent + "CC", fontWeight: 700, lineHeight: 1 }}>₹</span>
          <span style={{
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontSize: "clamp(32px, 5vw, 46px)", fontWeight: 700,
            color: accentText, letterSpacing: -1, lineHeight: 1, fontVariantNumeric: "tabular-nums",
          }}>{fmt(ltp)}</span>
        </div>
        <div style={{ fontSize: 13, marginTop: 8, fontWeight: 600, color: isUp ? upColor : downColor }}>
          {isUp ? "+" : "−"}₹{fmt(Math.abs(change))} today
        </div>
      </div>

      {commission > 0 && (
        <div style={{
          background: `${accent}08`, border: `1px solid ${accent}22`,
          borderRadius: 14, padding: "14px 16px", marginBottom: 20,
        }}>
          <div style={{ fontSize: 9, color: accent + "80", letterSpacing: 3, marginBottom: 6, fontWeight: 700 }}>YOUR PRICE</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
            <span style={{ fontSize: 14, color: accent, fontWeight: 700 }}>₹</span>
            <span style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "clamp(24px, 4vw, 34px)", fontWeight: 700, color: accent }}>
              {fmt(finalPrice)}
            </span>
          </div>
          <div style={{ fontSize: 11, color: accent + "60", marginTop: 5 }}>
            +₹{fmt(commVal)} {commissionType === "percent" ? `(${commission}%)` : "(flat)"}
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        {[
          { label: "HIGH",  value: data?.High,   color: upColor },
          { label: "LOW",   value: data?.Low,    color: downColor },
          { label: "CLOSE", value: data?.PClose, color: accent + "70" },
        ].map(s => (
          <div key={s.label} style={{
            background: "#FFFFFF04", border: "1px solid #FFFFFF07",
            borderRadius: 10, padding: "10px 8px", textAlign: "center",
          }}>
            <div style={{ fontSize: 8, color: "#707070", letterSpacing: 2, marginBottom: 5, fontWeight: 700 }}>{s.label}</div>
            <div style={{ fontSize: 12, fontWeight: 800, color: s.color }}>
              {s.value ? `₹${fmt(s.value)}` : "—"}
            </div>
          </div>
        ))}
      </div>

      {tickDate && (
        <div style={{ marginTop: 14, fontSize: 9, color: "#404040", textAlign: "right", fontFamily: "monospace" }}>
          {fmtTime(tickDate)}
        </div>
      )}
    </div>
  );
}

function MetalSection({ metal, scrips, commission, commissionType, getDataForScrip, isMobile }) {
  const isGold = metal === "gold";
  const accent = isGold ? "#D4A847" : "#8BACC0";
  return (
    <div style={{ marginBottom: 48 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 22 }}>
        <div style={{ fontSize: 9, color: accent + "AA", letterSpacing: 5, fontWeight: 700 }}>{isGold ? "GOLD" : "SILVER"}</div>
        <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${accent}40, transparent)` }} />
        <div style={{ fontSize: 9, color: accent + "50", letterSpacing: 3 }}>MCX</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)", gap: 16 }}>
        {scrips.map((scrip, i) => (
          <PriceCard key={scrip.ScripCode} scrip={scrip} data={getDataForScrip(scrip)}
            commission={commission} commissionType={commissionType} idx={i} />
        ))}
      </div>
    </div>
  );
}

// ─── ADMIN PANEL ──────────────────────────────────────────────────────────────
function AdminPanel({ commission, commissionType, onSave, apiKey, accessToken, onApiUpdate, onClose }) {
  const [lc, setLc]         = useState(String(commission));
  const [lt, setLt]         = useState(commissionType);
  const [lk, setLk]         = useState(apiKey);
  const [ltoken, setLtoken] = useState(accessToken);
  const [saved, setSaved]   = useState(false);
  const [err, setErr]       = useState("");

  function save() {
    const v = parseFloat(lc);
    if (isNaN(v) || v < 0) { setErr("Enter a valid non-negative number"); return; }
    if (lt === "percent" && v > 100) { setErr("Percent cannot exceed 100"); return; }
    setErr(""); onSave(v, lt); onApiUpdate(lk.trim(), ltoken.trim());
    setSaved(true); setTimeout(() => setSaved(false), 2000);
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
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: "linear-gradient(160deg, #090E18, #060A12)",
        border: "1px solid #1A2A3A", borderRadius: 22,
        padding: "32px 28px", width: "100%", maxWidth: 480,
        boxShadow: "0 40px 120px #000000AA",
        animation: "modalIn 0.3s cubic-bezier(.2,.8,.2,1)",
        maxHeight: "90vh", overflowY: "auto",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
          <div>
            <div style={{ fontSize: 9, color: "#506878", letterSpacing: 3, marginBottom: 5 }}>CONFIGURATION</div>
            <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 22, fontWeight: 700, color: "#8090A0" }}>Admin Settings</div>
          </div>
          <button onClick={onClose} style={{ width: 36, height: 36, borderRadius: "50%", border: "1px solid #1A2A3A", background: "none", color: "#506878", cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>

        <div style={{ fontSize: 8, color: "#506878", letterSpacing: 3, marginBottom: 14, fontWeight: 700 }}>API CONFIGURATION</div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 9, color: "#506878", letterSpacing: 2, marginBottom: 7 }}>5PAISA VENDOR KEY</div>
          <input value={lk} onChange={e => setLk(e.target.value)} placeholder="Vendor / App Key" style={inputStyle} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 9, color: "#506878", letterSpacing: 2, marginBottom: 7 }}>ACCESS TOKEN</div>
          <input value={ltoken} onChange={e => setLtoken(e.target.value)} placeholder="Bearer token (optional)" type="password" style={inputStyle} />
        </div>
        <div style={{ height: 1, background: "#0A1E2A", margin: "22px 0" }} />

        <div style={{ fontSize: 8, color: "#506878", letterSpacing: 3, marginBottom: 14, fontWeight: 700 }}>COMMISSION</div>
        <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
          {["flat", "percent"].map(t => (
            <button key={t} onClick={() => setLt(t)} style={{
              flex: 1, padding: "10px 0", borderRadius: 9, cursor: "pointer",
              border: `1px solid ${lt === t ? "#D4A847" : "#1A2A3A"}`,
              background: lt === t ? "#D4A84714" : "transparent",
              color: lt === t ? "#D4A847" : "#506878",
              fontWeight: 700, fontSize: 12, transition: "all 0.2s", fontFamily: "inherit",
            }}>{t === "flat" ? "₹ Flat" : "% Percent"}</button>
          ))}
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 9, color: "#506878", letterSpacing: 2, marginBottom: 7 }}>VALUE {lt === "flat" ? "(₹)" : "(%)"}</div>
          <input value={lc} onChange={e => setLc(e.target.value)} placeholder={lt === "flat" ? "500" : "2.5"} type="number" min="0" style={inputStyle} />
        </div>
        {err && <div style={{ color: "#F07070", fontSize: 11, marginBottom: 8 }}>{err}</div>}
        <button onClick={save} style={{
          width: "100%", padding: "13px", marginTop: 6, borderRadius: 11, cursor: "pointer",
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
  const [tab, setTab]                 = useState("all");
  const [countdown, setCountdown]     = useState(REFRESH_INTERVAL / 1000);

  const [commission, setCommission]       = useState(() => storage.get("commission", 0));
  const [commissionType, setCommissionType] = useState(() => storage.get("commissionType", "flat"));
  const [apiKey, setApiKey]               = useState(() => storage.get("apiKey", ""));
  const [accessToken, setAccessToken]     = useState(() => storage.get("accessToken", ""));

  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [adminIn, setAdminIn]               = useState(false);
  const [showUserMenu, setShowUserMenu]     = useState(false);

  const timerRef    = useRef(null);
  const countdownRef = useRef(null);

  const fetchPrices = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      if (!apiKey) { setPrices(getMockData()); setUseMock(true); }
      else { setPrices(await fetchAllPrices(apiKey, accessToken)); setUseMock(false); }
      setLastUpdated(new Date()); setCountdown(REFRESH_INTERVAL / 1000);
    } catch (e) { setError(e.message); setPrices(getMockData()); setUseMock(true); }
    setLoading(false);
  }, [apiKey, accessToken]);

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

  const gd0 = getDataForScrip(GOLD_SCRIPS[0]);
  const sd0 = getDataForScrip(SILVER_SCRIPS[0]);
  const goldLTP    = gd0?.LastRate || 0;
  const silverLTP  = sd0?.LastRate || 0;
  const goldChg    = gd0 ? gd0.LastRate - gd0.PClose : 0;
  const silverChg  = sd0 ? sd0.LastRate - sd0.PClose : 0;

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

        {/* Hero */}
        <div style={{
          display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
          gap: 14, marginBottom: isMobile ? 32 : 52,
        }}>
          {[
            { label: "GOLD",   ltp: goldLTP,   chg: goldChg,   accent: "#D4A847", bg: "linear-gradient(140deg, #141008, #1C1408)" },
            { label: "SILVER", ltp: silverLTP, chg: silverChg, accent: "#8BACC0", bg: "linear-gradient(140deg, #08101A, #0C1420)" },
          ].map((m, i) => (
            <div key={m.label} style={{
              background: m.bg, border: `1px solid ${m.accent}22`,
              borderRadius: 18, padding: isMobile ? "20px" : "24px 26px",
              position: "relative", overflow: "hidden",
              animation: `cardIn 0.5s ease ${i * 0.1}s both`,
            }}>
              <div style={{ position: "absolute", top: 0, left: "10%", right: "10%", height: 1, background: `linear-gradient(90deg, transparent, ${m.accent}50, transparent)` }} />
              <div style={{ fontSize: 9, color: m.accent + "70", letterSpacing: 5, fontWeight: 700, marginBottom: 10 }}>{m.label} · MCX</div>
              <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: isMobile ? 36 : "clamp(32px, 3.5vw, 44px)", fontWeight: 700, color: m.accent, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                ₹{fmt(m.ltp)}
              </div>
              <div style={{ fontSize: 13, marginTop: 9, fontWeight: 600, color: m.chg >= 0 ? "#5FD988" : "#F07070" }}>
                {m.chg >= 0 ? "+" : "−"}₹{fmt(Math.abs(m.chg))}
              </div>
            </div>
          ))}
        </div>

        {/* Banners */}
        {useMock && (
          <div style={{ fontSize: 11, color: "#7A6020", background: "#C9A84708", border: "1px solid #C9A84718", borderRadius: 10, padding: "10px 16px", marginBottom: 24, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ opacity: 0.5 }}>◈</span> Demo mode — add your 5paisa API key in Admin for live data
          </div>
        )}
        {error && (
          <div style={{ fontSize: 11, color: "#805050", background: "#F0606806", border: "1px solid #F0606815", borderRadius: 10, padding: "10px 16px", marginBottom: 24 }}>⚠ {error}</div>
        )}
        {commission > 0 && (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: "#7A6020", background: "#C9A84706", border: "1px solid #C9A84715", borderRadius: 20, padding: "6px 14px", marginBottom: 24 }}>
            Commission: {commissionType === "percent" ? `${commission}%` : `₹${fmt(commission)}`}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: "1px solid #0A1828", marginBottom: 32 }}>
          {[{ id: "all", label: "ALL MARKETS", accent: "#5A7090" }, { id: "gold", label: "GOLD", accent: "#D4A847" }, { id: "silver", label: "SILVER", accent: "#8BACC0" }].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: isMobile ? "10px 14px" : "10px 22px", background: "none", border: "none",
              borderBottom: `2px solid ${tab === t.id ? t.accent : "transparent"}`,
              color: tab === t.id ? t.accent : "#3A5060",
              cursor: "pointer", fontSize: 10, fontWeight: 700, letterSpacing: 2,
              transition: "all 0.2s", marginBottom: "-1px", fontFamily: "inherit",
            }}>{t.label}</button>
          ))}
        </div>

        {(tab === "all" || tab === "gold") && (
          <MetalSection metal="gold" scrips={GOLD_SCRIPS} commission={commission} commissionType={commissionType} getDataForScrip={getDataForScrip} isMobile={isMobile} />
        )}
        {(tab === "all" || tab === "silver") && (
          <MetalSection metal="silver" scrips={SILVER_SCRIPS} commission={commission} commissionType={commissionType} getDataForScrip={getDataForScrip} isMobile={isMobile} />
        )}

        {/* Footer */}
        <div style={{ borderTop: "1px solid #080E18", paddingTop: 24, marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", gap: isMobile ? 16 : 28, flexWrap: "wrap" }}>
            {[["Exchange", "MCX India"], ["Source", "5paisa API"], ["Refresh", `${REFRESH_INTERVAL / 1000}s`], ["Currency", "INR ₹"]].map(([l, v]) => (
              <div key={l}>
                <div style={{ fontSize: 7, color: "#2A3A4A", letterSpacing: 2, fontWeight: 700, marginBottom: 4 }}>{l}</div>
                <div style={{ fontSize: 11, color: "#3A5060", fontWeight: 700 }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ marginTop: 18, fontSize: 9, color: "#1A2A3A", textAlign: "center" }}>
          Indicative prices only · Not financial advice
        </div>
      </div>

      {showAdminLogin && <AdminLoginModal onLogin={() => { setAdminIn(true); setShowAdminLogin(false); setShowAdminPanel(true); }} onClose={() => setShowAdminLogin(false)} />}
      {showAdminPanel && (
        <AdminPanel commission={commission} commissionType={commissionType} apiKey={apiKey} accessToken={accessToken}
          onSave={(v, t) => { setCommission(v); setCommissionType(t); storage.set("commission", v); storage.set("commissionType", t); }}
          onApiUpdate={(k, tok) => { setApiKey(k); setAccessToken(tok); storage.set("apiKey", k); storage.set("accessToken", tok); }}
          onClose={() => setShowAdminPanel(false)} />
      )}
    </div>
  );
}

// ─── ROOT APP — handles auth flow ─────────────────────────────────────────────
export default function App() {
  // Check for existing session
  const [user, setUser]           = useState(() => storage.get("user", null));
  const [otpPending, setOtpPending] = useState(null); // { name, phone }

  function handleLogout() {
    storage.del("user");
    setUser(null);
    setOtpPending(null);
  }

  // Not logged in → show login
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

  // Logged in → show tracker
  return <TrackerApp user={user} onLogout={handleLogout} />;
}
