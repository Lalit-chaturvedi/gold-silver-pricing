import { useState, useEffect, useCallback, useRef } from "react";

const API_URL = "https://Openapi.5paisa.com/VendorsAPI/Service1.svc/V1/MarketFeed";

const GOLD_SCRIPS = [
  { label: "GOLD", sublabel: "Standard Contract", Exch: "M", ExchType: "D", ScripCode: "57592", unit: "10g", metal: "gold" },
  { label: "GOLDM", sublabel: "Mini Contract", Exch: "M", ExchType: "D", ScripCode: "57607", unit: "1g", metal: "gold" },
];
const SILVER_SCRIPS = [
  { label: "SILVER", sublabel: "Standard Contract", Exch: "M", ExchType: "D", ScripCode: "57630", unit: "1kg", metal: "silver" },
  { label: "SILVERM", sublabel: "Mini Contract", Exch: "M", ExchType: "D", ScripCode: "57631", unit: "100g", metal: "silver" },
];
const ALL_SCRIPS = [...GOLD_SCRIPS, ...SILVER_SCRIPS];
const ADMIN_CREDENTIALS = { username: "admin", password: "admin@123" };
const REFRESH_INTERVAL = 30000;

const storage = {
  get: (k, d) => { try { const v = sessionStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set: (k, v) => { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

const fmt = (n) => new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(n);
const fmtTime = (d) => d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

function parseTickDate(t) {
  if (!t) return null;
  const m = String(t).match(/\d+/);
  return m ? new Date(parseInt(m[0])) : null;
}

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
    OpenRate: bases[i] - 30, AvgRate: bases[i] + 20,
    TickDt: `/Date(${Date.now()})/`, _mock: true,
  }));
}

// ── useWindowWidth hook ──────────────────────────────────────────────────────
function useWindowWidth() {
  const [w, setW] = useState(typeof window !== "undefined" ? window.innerWidth : 1200);
  useEffect(() => {
    const handler = () => setW(window.innerWidth);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return w;
}

// ── Price Card ───────────────────────────────────────────────────────────────
function PriceCard({ scrip, data, commission, commissionType, idx }) {
  const isGold = scrip.metal === "gold";
  const ltp = data?.LastRate ?? 0;
  const pclose = data?.PClose ?? 0;
  const change = ltp - pclose;
  const changePct = pclose ? (change / pclose) * 100 : 0;
  const isUp = change >= 0;
  const commVal = commissionType === "percent" ? ltp * (commission / 100) : commission;
  const finalPrice = ltp + commVal;
  const tickDate = parseTickDate(data?.TickDt);

  const accent      = isGold ? "#D4A847" : "#8BACC0";
  const accentText  = isGold ? "#F5E199" : "#C8DCF0";
  const upColor     = "#5FD988";
  const downColor   = "#F07070";

  return (
    <div className="price-card" style={{
      background: isGold
        ? "linear-gradient(160deg, #181008 0%, #221808 60%, #14100A 100%)"
        : "linear-gradient(160deg, #0A1018 0%, #101C28 60%, #08101A 100%)",
      border: `1px solid ${accent}28`,
      borderRadius: 20,
      padding: "28px 24px",
      position: "relative",
      overflow: "hidden",
      transition: "transform 0.3s ease, box-shadow 0.3s ease",
      animationDelay: `${idx * 0.1}s`,
      width: "100%",
    }}>
      {/* top shimmer line */}
      <div style={{
        position: "absolute", top: 0, left: "10%", right: "10%", height: 1,
        background: `linear-gradient(90deg, transparent, ${accent}60, transparent)`,
      }} />
      {/* corner glow */}
      <div style={{
        position: "absolute", top: -60, right: -60, width: 180, height: 180, borderRadius: "50%",
        background: `radial-gradient(circle, ${accent}10 0%, transparent 70%)`,
        pointerEvents: "none",
      }} />

      {data?._mock && (
        <span style={{
          position: "absolute", top: 14, right: 14,
          fontSize: 8, color: "#707070", letterSpacing: 2,
          background: "#111", border: "1px solid #222",
          padding: "2px 8px", borderRadius: 20,
        }}>DEMO</span>
      )}

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <div style={{
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontSize: 22, fontWeight: 700, color: accentText, letterSpacing: 1.5, lineHeight: 1,
          }}>
            {scrip.label}
          </div>
          <div style={{ fontSize: 11, color: accent + "80", letterSpacing: 2, marginTop: 6 }}>
            {scrip.sublabel} &nbsp;·&nbsp; per {scrip.unit}
          </div>
        </div>
        <div style={{
          fontSize: 12, fontWeight: 700,
          color: isUp ? upColor : downColor,
          background: isUp ? "#0D2016" : "#200D0D",
          border: `1px solid ${isUp ? "#1A4828" : "#481A1A"}`,
          padding: "5px 11px", borderRadius: 8,
          whiteSpace: "nowrap",
        }}>
          {isUp ? "▲" : "▼"} {fmt(Math.abs(changePct))}%
        </div>
      </div>

      <div style={{ height: 1, background: `${accent}18`, marginBottom: 20 }} />

      {/* Price */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 9, color: accent + "60", letterSpacing: 3, marginBottom: 8, fontWeight: 700 }}>MARKET PRICE</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
          <span style={{ fontSize: 18, color: accent + "CC", fontWeight: 700, lineHeight: 1 }}>₹</span>
          <span style={{
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontSize: "clamp(32px, 5vw, 46px)", fontWeight: 700,
            color: accentText, letterSpacing: -1, lineHeight: 1,
            fontVariantNumeric: "tabular-nums",
          }}>{fmt(ltp)}</span>
        </div>
        <div style={{ fontSize: 13, marginTop: 8, fontWeight: 600, color: isUp ? upColor : downColor }}>
          {isUp ? "+" : "−"}₹{fmt(Math.abs(change))} today
        </div>
      </div>

      {/* Commission */}
      {commission > 0 && (
        <div style={{
          background: `${accent}08`, border: `1px solid ${accent}22`,
          borderRadius: 14, padding: "14px 16px", marginBottom: 20,
        }}>
          <div style={{ fontSize: 9, color: accent + "80", letterSpacing: 3, marginBottom: 6, fontWeight: 700 }}>YOUR PRICE</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
            <span style={{ fontSize: 14, color: accent, fontWeight: 700 }}>₹</span>
            <span style={{
              fontFamily: "'Cormorant Garamond', Georgia, serif",
              fontSize: "clamp(24px, 4vw, 34px)", fontWeight: 700, color: accent,
            }}>{fmt(finalPrice)}</span>
          </div>
          <div style={{ fontSize: 11, color: accent + "60", marginTop: 5 }}>
            +₹{fmt(commVal)} {commissionType === "percent" ? `(${commission}%)` : "(flat)"}
          </div>
        </div>
      )}

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        {[
          { label: "HIGH", value: data?.High, color: upColor },
          { label: "LOW",  value: data?.Low,  color: downColor },
          { label: "CLOSE", value: data?.PClose, color: accent + "70" },
        ].map(s => (
          <div key={s.label} style={{
            background: "#FFFFFF04", border: "1px solid #FFFFFF07",
            borderRadius: 10, padding: "10px 8px", textAlign: "center",
          }}>
            <div style={{ fontSize: 8, color: "#808080", letterSpacing: 2, marginBottom: 5, fontWeight: 700 }}>{s.label}</div>
            <div style={{ fontSize: 12, fontWeight: 800, color: s.color }}>
              {s.value ? `₹${fmt(s.value)}` : "—"}
            </div>
          </div>
        ))}
      </div>

      {tickDate && (
        <div style={{ marginTop: 14, fontSize: 9, color: "#707070", textAlign: "right", fontFamily: "monospace" }}>
          {fmtTime(tickDate)}
        </div>
      )}
    </div>
  );
}

// ── Metal Section ────────────────────────────────────────────────────────────
function MetalSection({ metal, scrips, commission, commissionType, getDataForScrip, isMobile }) {
  const isGold = metal === "gold";
  const accent = isGold ? "#D4A847" : "#8BACC0";
  return (
    <div style={{ marginBottom: 48 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 22 }}>
        <div style={{ fontSize: 9, color: accent + "AA", letterSpacing: 5, fontWeight: 700 }}>
          {isGold ? "GOLD" : "SILVER"}
        </div>
        <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${accent}40, transparent)` }} />
        <div style={{ fontSize: 9, color: accent + "50", letterSpacing: 3 }}>MCX</div>
      </div>
      <div style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)",
        gap: 16,
      }}>
        {scrips.map((scrip, i) => (
          <PriceCard key={scrip.ScripCode} scrip={scrip} data={getDataForScrip(scrip)}
            commission={commission} commissionType={commissionType} idx={i} />
        ))}
      </div>
    </div>
  );
}

// ── Admin helpers ────────────────────────────────────────────────────────────
function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 9, color: "#8090A0", letterSpacing: 2.5, fontWeight: 700, marginBottom: 7 }}>{label}</div>
      {children}
    </div>
  );
}
function AInput(props) {
  return (
    <input {...props} style={{
      width: "100%", background: "#040609", border: "1px solid #141E2A",
      borderRadius: 9, padding: "11px 13px", color: "#7090A8", fontSize: 14,
      outline: "none", fontFamily: "inherit", boxSizing: "border-box", transition: "border-color 0.2s",
    }} />
  );
}

function AdminModal({ commission, commissionType, onSave, apiKey, accessToken, onApiUpdate, onClose }) {
  const [lc, setLc] = useState(String(commission));
  const [lt, setLt] = useState(commissionType);
  const [lk, setLk] = useState(apiKey);
  const [ltoken, setLtoken] = useState(accessToken);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");

  function save() {
    const v = parseFloat(lc);
    if (isNaN(v) || v < 0) { setErr("Enter a valid non-negative number"); return; }
    if (lt === "percent" && v > 100) { setErr("Percent cannot exceed 100"); return; }
    setErr("");
    onSave(v, lt); onApiUpdate(lk.trim(), ltoken.trim());
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "#000000B0", backdropFilter: "blur(10px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: "linear-gradient(160deg, #090E18, #060A12)",
        border: "1px solid #141E2A", borderRadius: 22,
        padding: "32px 28px", width: "100%", maxWidth: 480,
        boxShadow: "0 40px 120px #000000AA",
        animation: "modalIn 0.3s cubic-bezier(.2,.8,.2,1)",
        maxHeight: "90vh", overflowY: "auto",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
          <div>
            <div style={{ fontSize: 9, color: "#8090A0", letterSpacing: 3, marginBottom: 5 }}>CONFIGURATION</div>
            <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 22, fontWeight: 700, color: "#8090A0" }}>Admin Settings</div>
          </div>
          <button onClick={onClose} style={{
            width: 36, height: 36, borderRadius: "50%", border: "1px solid #141E2A",
            background: "none", color: "#8090A0", cursor: "pointer", fontSize: 16,
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>✕</button>
        </div>

        <div style={{ fontSize: 8, color: "#607080", letterSpacing: 3, marginBottom: 14, fontWeight: 700 }}>API CONFIGURATION</div>
        <Field label="5PAISA VENDOR KEY"><AInput value={lk} onChange={e => setLk(e.target.value)} placeholder="Vendor / App Key" /></Field>
        <Field label="ACCESS TOKEN"><AInput value={ltoken} onChange={e => setLtoken(e.target.value)} placeholder="Bearer token (optional)" type="password" /></Field>
        <div style={{ fontSize: 10, color: "#506070", marginBottom: 4 }}>Leave blank to run in demo mode.</div>
        <div style={{ height: 1, background: "#304050", margin: "22px 0" }} />

        <div style={{ fontSize: 8, color: "#607080", letterSpacing: 3, marginBottom: 14, fontWeight: 700 }}>COMMISSION</div>
        <Field label="TYPE">
          <div style={{ display: "flex", gap: 10 }}>
            {["flat", "percent"].map(t => (
              <button key={t} onClick={() => setLt(t)} style={{
                flex: 1, padding: "10px 0", borderRadius: 9, cursor: "pointer",
                border: `1px solid ${lt === t ? "#D4A847" : "#141E2A"}`,
                background: lt === t ? "#D4A84714" : "transparent",
                color: lt === t ? "#D4A847" : "#8090A0",
                fontWeight: 700, fontSize: 12, transition: "all 0.2s", fontFamily: "inherit",
              }}>{t === "flat" ? "₹ Flat" : "% Percent"}</button>
            ))}
          </div>
        </Field>
        <Field label={`VALUE ${lt === "flat" ? "(₹)" : "(%)"}`}>
          <AInput value={lc} onChange={e => setLc(e.target.value)} placeholder={lt === "flat" ? "500" : "2.5"} type="number" min="0" />
        </Field>
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

function LoginModal({ onLogin, onClose }) {
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
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "#000000B0", backdropFilter: "blur(10px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }} onClick={e => e.target === e.currentTarget && onClose?.()}>
      <div style={{
        background: "linear-gradient(160deg, #090E18, #060A12)",
        border: "1px solid #141E2A", borderRadius: 22,
        padding: "40px 28px", width: "100%", maxWidth: 360,
        boxShadow: "0 40px 120px #000000AA",
        animation: "modalIn 0.3s cubic-bezier(.2,.8,.2,1)", textAlign: "center",
      }}>
        <div style={{
          width: 50, height: 50, borderRadius: 14, margin: "0 auto 18px",
          background: "#D4A84712", border: "1px solid #D4A84730",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22,
        }}>⚿</div>
        <div style={{ fontSize: 9, color: "#8090A0", letterSpacing: 4, marginBottom: 6 }}>RESTRICTED</div>
        <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 22, fontWeight: 700, color: "#8090A0", marginBottom: 28 }}>Admin Access</div>
        <div style={{ textAlign: "left" }}>
          <Field label="USERNAME"><AInput value={u} onChange={e => setU(e.target.value)} placeholder="admin" /></Field>
          <Field label="PASSWORD"><AInput value={p} onChange={e => setP(e.target.value)} placeholder="••••••••" type="password" onKeyDown={e => e.key === "Enter" && go()} /></Field>
        </div>
        {err && <div style={{ color: "#F07070", fontSize: 11, marginBottom: 10 }}>{err}</div>}
        <button onClick={go} disabled={loading} style={{
          width: "100%", padding: "12px", borderRadius: 10, border: "none",
          background: "linear-gradient(135deg, #C9A84C, #ECC84A)",
          color: "#1A0E00", fontWeight: 900, fontSize: 14,
          cursor: loading ? "wait" : "pointer", opacity: loading ? 0.7 : 1,
          marginTop: 4, transition: "opacity 0.2s", fontFamily: "inherit",
        }}>
          {loading ? "Verifying..." : "Enter"}
        </button>
        <div style={{ marginTop: 14, fontSize: 10, color: "#506070" }}>admin / admin@123</div>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <span style={{ display: "inline-block", width: 13, height: 13, marginRight: 5, verticalAlign: "middle" }}>
      <svg viewBox="0 0 24 24" style={{ animation: "spin 1s linear infinite", display: "block" }}>
        <circle cx="12" cy="12" r="10" fill="none" stroke="#3A5060" strokeWidth="3" strokeDasharray="31" strokeDashoffset="10" />
      </svg>
    </span>
  );
}

// ── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const width = useWindowWidth();
  const isMobile = width < 640;
  const isTablet = width >= 640 && width < 1024;

  const [prices, setPrices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [error, setError] = useState(null);
  const [useMock, setUseMock] = useState(false);
  const [tab, setTab] = useState("all");

  const [commission, setCommission] = useState(() => storage.get("commission", 0));
  const [commissionType, setCommissionType] = useState(() => storage.get("commissionType", "flat"));
  const [apiKey, setApiKey] = useState(() => storage.get("apiKey", ""));
  const [accessToken, setAccessToken] = useState(() => storage.get("accessToken", ""));

  const [showLogin, setShowLogin] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [adminIn, setAdminIn] = useState(false);
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL / 1000);

  const timerRef = useRef(null);
  const countdownRef = useRef(null);

  const fetchPrices = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      if (!apiKey) { setPrices(getMockData()); setUseMock(true); }
      else { setPrices(await fetchAllPrices(apiKey, accessToken)); setUseMock(false); }
      setLastUpdated(new Date());
      setCountdown(REFRESH_INTERVAL / 1000);
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
  const goldLTP  = gd0?.LastRate || 0;
  const silverLTP = sd0?.LastRate || 0;
  const goldChg  = gd0 ? gd0.LastRate - gd0.PClose : 0;
  const silverChg = sd0 ? sd0.LastRate - sd0.PClose : 0;

  const px = isMobile ? "16px" : isTablet ? "24px" : "32px";

  return (
    <div style={{
      minHeight: "100vh",
      background: "#04070D",
      fontFamily: "'Georgia', 'Palatino Linotype', serif",
      color: "#6080A0",
      overflowX: "hidden",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600;700&display=swap');
        @keyframes spin    { to { transform: rotate(360deg); } }
        @keyframes pulse   { 0%,100%{opacity:1} 50%{opacity:0.25} }
        @keyframes cardIn  { from { opacity:0; transform:translateY(18px); } to { opacity:1; transform:translateY(0); } }
        @keyframes modalIn { from { opacity:0; transform:scale(0.95) translateY(-10px); } to { opacity:1; transform:scale(1) translateY(0); } }
        @keyframes floatOrb { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-18px)} }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .price-card { animation: cardIn 0.5s cubic-bezier(.2,.8,.2,1) both; }
        .price-card:hover { transform: translateY(-4px); box-shadow: 0 16px 48px rgba(0,0,0,0.5); }
        input:focus { border-color: #C9A84C !important; box-shadow: 0 0 0 2px #C9A84C10; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #020408; }
        ::-webkit-scrollbar-thumb { background: #3A5060; border-radius: 10px; }
      `}</style>

      {/* ambient orbs */}
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "hidden" }}>
        <div style={{
          position: "absolute", top: "-15%", left: "-5%", width: "60vw", height: "60vw", maxWidth: 700, maxHeight: 700, borderRadius: "50%",
          background: "radial-gradient(circle, #C9A84C06 0%, transparent 55%)",
          animation: "floatOrb 14s ease-in-out infinite",
        }} />
        <div style={{
          position: "absolute", bottom: "0%", right: "-5%", width: "50vw", height: "50vw", maxWidth: 600, maxHeight: 600, borderRadius: "50%",
          background: "radial-gradient(circle, #5080A006 0%, transparent 55%)",
          animation: "floatOrb 18s ease-in-out infinite reverse",
        }} />
      </div>

      {/* ── HEADER ── */}
      <div style={{
        position: "sticky", top: 0, zIndex: 100,
        background: "#04070DF4", backdropFilter: "blur(28px)",
        borderBottom: "1px solid #0A1020",
        padding: `14px ${px}`,
        display: "flex", justifyContent: "space-between", alignItems: "center",
        gap: 12,
      }}>
        {/* Title */}
        <div style={{ flexShrink: 0 }}>
          <div style={{
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontSize: isMobile ? 16 : 20,
            fontWeight: 700, letterSpacing: isMobile ? 4 : 6,
            background: "linear-gradient(100deg, #C9A847CC, #ECC84ACC, #8BACC0CC)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>
            GOLD · SILVER
          </div>
          {!isMobile && (
            <div style={{ fontSize: 8, color: "#5A7A8A", letterSpacing: 4, marginTop: 3 }}>MCX LIVE MARKET RATES</div>
          )}
        </div>

        {/* Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 8 : 12 }}>
          {/* live dot */}
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{
              width: 6, height: 6, borderRadius: "50%",
              background: error ? "#F07070" : "#5FD988",
              boxShadow: `0 0 7px ${error ? "#F0707055" : "#5FD98855"}`,
              animation: "pulse 2s ease-in-out infinite",
            }} />
            {!isMobile && (
              <span style={{ fontSize: 8, color: "#6A8A9A", letterSpacing: 2.5, fontFamily: "monospace" }}>
                {error ? "ERROR" : "LIVE"}
              </span>
            )}
          </div>

          <button onClick={fetchPrices} disabled={loading} style={{
            background: "none", border: "1px solid #3A5060",
            color: "#7090A8", padding: isMobile ? "6px 10px" : "7px 14px", borderRadius: 8,
            cursor: "pointer", fontSize: isMobile ? 11 : 11, fontFamily: "inherit", letterSpacing: 1,
            display: "flex", alignItems: "center", gap: 3, transition: "all 0.2s",
          }}>
            {loading ? <Spinner /> : "↻"}{!isMobile && " Refresh"}
          </button>

          <button onClick={() => adminIn ? setShowAdmin(true) : setShowLogin(true)} style={{
            background: "#C9A84708", border: "1px solid #C9A84722",
            color: "#C9A84C", padding: isMobile ? "6px 10px" : "7px 14px", borderRadius: 8,
            cursor: "pointer", fontSize: 11, fontWeight: 700, letterSpacing: 1.5,
            transition: "all 0.2s", fontFamily: "inherit",
          }}>
            {isMobile ? "⚙" : "ADMIN"}
          </button>
        </div>
      </div>

      {/* ── MAIN ── */}
      <div style={{
        maxWidth: "100%",
        margin: "0 auto",
        padding: `${isMobile ? 28 : 44}px ${px} 80px`,
        position: "relative", zIndex: 1,
      }}>

        {/* Hero snapshot - stacks on mobile */}
        <div style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : isTablet ? "1fr 1fr" : "1fr 1fr",
          gap: 14, marginBottom: isMobile ? 32 : 52,
        }}>
          {[
            { label: "GOLD",   ltp: goldLTP,   chg: goldChg,   accent: "#D4A847", bg: "linear-gradient(140deg, #141008, #1C1408)", showCountdown: false },
            { label: "SILVER", ltp: silverLTP, chg: silverChg, accent: "#8BACC0", bg: "linear-gradient(140deg, #08101A, #0C1420)", showCountdown: true },
          ].map((m, i) => (
            <div key={m.label} style={{
              background: m.bg, border: `1px solid ${m.accent}22`,
              borderRadius: 18, padding: isMobile ? "20px 20px" : "24px 26px",
              position: "relative", overflow: "hidden",
              animation: `cardIn 0.5s ease ${i * 0.1}s both`,
            }}>
              <div style={{
                position: "absolute", top: 0, left: "10%", right: "10%", height: 1,
                background: `linear-gradient(90deg, transparent, ${m.accent}50, transparent)`,
              }} />
              <div style={{ fontSize: 9, color: m.accent + "70", letterSpacing: 5, fontWeight: 700, marginBottom: 10 }}>{m.label} · MCX</div>
              <div style={{
                fontFamily: "'Cormorant Garamond', Georgia, serif",
                fontSize: isMobile ? 36 : "clamp(32px, 3.5vw, 44px)",
                fontWeight: 700, color: m.accent, lineHeight: 1, fontVariantNumeric: "tabular-nums",
              }}>
                ₹{fmt(m.ltp)}
              </div>
              <div style={{ fontSize: 13, marginTop: 9, fontWeight: 600, color: m.chg >= 0 ? "#5FD988" : "#F07070" }}>
                {m.chg >= 0 ? "+" : "−"}₹{fmt(Math.abs(m.chg))}
              </div>
              {m.showCountdown && (
                <div style={{
                  position: "absolute", bottom: 14, right: 16,
                  fontSize: 9, color: "#607888", letterSpacing: 2, fontFamily: "monospace",
                }}>↻ {countdown}s</div>
              )}
            </div>
          ))}
        </div>

        {/* Banners */}
        {useMock && (
          <div style={{
            fontSize: 11, color: "#C9A040", background: "#C9A84708", border: "1px solid #C9A84718",
            borderRadius: 10, padding: "10px 16px", marginBottom: 24,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{ opacity: 0.5, flexShrink: 0 }}>◈</span>
            Demo mode — add your 5paisa API key in Admin for live data
          </div>
        )}
        {error && (
          <div style={{
            fontSize: 11, color: "#805050", background: "#F0606806", border: "1px solid #F0606815",
            borderRadius: 10, padding: "10px 16px", marginBottom: 24,
          }}>⚠ {error}</div>
        )}
        {commission > 0 && (
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            fontSize: 11, color: "#C9A040", background: "#C9A84706", border: "1px solid #C9A84715",
            borderRadius: 20, padding: "6px 14px", marginBottom: 24,
          }}>
            Commission: {commissionType === "percent" ? `${commission}%` : `₹${fmt(commission)}`}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: "1px solid #304050", marginBottom: 32 }}>
          {[
            { id: "all",    label: "ALL MARKETS", accent: "#5A7090" },
            { id: "gold",   label: "GOLD",         accent: "#D4A847" },
            { id: "silver", label: "SILVER",        accent: "#8BACC0" },
          ].map(t => {
            const active = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                padding: isMobile ? "10px 14px" : "10px 22px",
                background: "none", border: "none",
                borderBottom: `2px solid ${active ? t.accent : "transparent"}`,
                color: active ? t.accent : "#607080",
                cursor: "pointer", fontSize: isMobile ? 10 : 10, fontWeight: 700, letterSpacing: 2,
                transition: "all 0.2s", marginBottom: "-1px", fontFamily: "inherit",
              }}>{t.label}</button>
            );
          })}
        </div>

        {/* Price Cards */}
        {(tab === "all" || tab === "gold") && (
          <MetalSection metal="gold" scrips={GOLD_SCRIPS} commission={commission}
            commissionType={commissionType} getDataForScrip={getDataForScrip} isMobile={isMobile} />
        )}
        {(tab === "all" || tab === "silver") && (
          <MetalSection metal="silver" scrips={SILVER_SCRIPS} commission={commission}
            commissionType={commissionType} getDataForScrip={getDataForScrip} isMobile={isMobile} />
        )}

        {/* Footer */}
        <div style={{
          borderTop: "1px solid #304050", paddingTop: 24, marginTop: 8,
          display: "flex", justifyContent: "space-between", alignItems: "center",
          flexWrap: "wrap", gap: 12,
        }}>
          <div style={{ display: "flex", gap: isMobile ? 16 : 28, flexWrap: "wrap" }}>
            {[["Exchange", "MCX India"], ["Source", "5paisa API"], ["Refresh", `${REFRESH_INTERVAL / 1000}s`], ["Currency", "INR ₹"]].map(([l, v]) => (
              <div key={l}>
                <div style={{ fontSize: 7, color: "#506070", letterSpacing: 2, fontWeight: 700, marginBottom: 4 }}>{l}</div>
                <div style={{ fontSize: 11, color: "#607080", fontWeight: 700 }}>{v}</div>
              </div>
            ))}
          </div>
          {lastUpdated && (
            <div style={{ fontSize: 9, color: "#506070", letterSpacing: 1, fontFamily: "monospace" }}>
              {fmtTime(lastUpdated)}
            </div>
          )}
        </div>

        <div style={{ marginTop: 18, fontSize: 9, color: "#506878", textAlign: "center", letterSpacing: 0.5 }}>
          Indicative prices only · Not financial advice
        </div>
      </div>

      {showLogin && (
        <LoginModal onLogin={() => { setAdminIn(true); setShowLogin(false); setShowAdmin(true); }} onClose={() => setShowLogin(false)} />
      )}
      {showAdmin && (
        <AdminModal commission={commission} commissionType={commissionType} apiKey={apiKey} accessToken={accessToken}
          onSave={(v, t) => { setCommission(v); setCommissionType(t); storage.set("commission", v); storage.set("commissionType", t); }}
          onApiUpdate={(k, tok) => { setApiKey(k); setAccessToken(tok); storage.set("apiKey", k); storage.set("accessToken", tok); }}
          onClose={() => setShowAdmin(false)} />
      )}
    </div>
  );
}
