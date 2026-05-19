import { useState, useEffect, useRef } from "react";

const MODEL = "claude-sonnet-4-20250514";

// ─── JSON repair + parse ───────────────────────────────────────────────────
function safeParseJSON(raw) {
  let s = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a === -1 || b === -1) throw new Error("No JSON found in response");
  s = s.slice(a, b + 1)
    .replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2013\u2014]/g, "-").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/,(\s*[}\]])/g, "$1")
    .replace(/([{,]\s*)([A-Za-z_]\w*)(\s*:)/g, '$1"$2"$3');
  return JSON.parse(s);
}

// NOTE: Update the URL endpoint if you transition this to a backend proxy/Netlify edge function to avoid CORS blocks
async function callClaude(prompt, maxTokens) {
    // We route through a public CORS proxy for local client-side testing
    const proxyUrl = "https://cors-anywhere.herokuapp.com/";
    const targetUrl = "https://api.anthropic.com/v1/messages";
    
    const res = await fetch(proxyUrl + targetUrl, {
      method: "POST", 
      headers: { 
        "Content-Type": "application/json",
        "x-requested-with": "XMLHttpRequest", // Required by cors-anywhere
        "x-api-key": import.meta.env.VITE_ANTHROPIC_API_KEY || "", 
        "anthropic-version": "2023-06-01" // Crucial header for Anthropic production servers
      },
      body: JSON.stringify({
        model: MODEL, 
        max_tokens: maxTokens || 4000,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: [{ role: "user", content: prompt }]
      })
    });
    
    if (res.status === 403) {
      throw new Error("CORS Proxy Access Required. Please visit https://cors-anywhere.herokuapp.com/corsdemo and click 'Request temporary access' to unlock live local API requests.");
    }
    
    if (!res.ok) throw new Error("HTTP " + res.status + " - Unauthorized/Invalid request parsing.");
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    let text = "";
    for (const b of data.content || []) if (b.type === "text") text += b.text;
    if (!text) throw new Error("Empty response");
    return safeParseJSON(text);
  }

// ─── Prompts ───────────────────────────────────────────────────────────────
const CYCLE_PROMPT = `You are an Indian equity analyst. Search the web for CURRENT data (May 2026):
1. India VIX level and direction
2. FII net equity flows last 3 months (NSE/NSDL)
3. % of Nifty 500 stocks above 200-day moving average
4. USD/INR trend last 3 months
5. IPO activity last 6 months (quantity and quality)
6. QIP and promoter stake sales last 12 months
7. BSE SmallCap index performance vs peak
8. Retail sentiment (SIP flows, social media, Google Trends)

Gautam Baid market cycle stages:
BULL_STAGE_1: Bear ended, beaten-down bounce hardest, broad recovery
BULL_STAGE_2: Narrow market, sectoral rotation, quality rewarded, longest phase
BULL_STAGE_3: Euphoria, record QIPs, dubious IPOs 200x oversubscribed, insiders exiting
BEAR_STAGE_1: 20-25% fall, buy-the-dip mentality, confidence still high
BEAR_STAGE_2: Good earnings not rewarded, stocks fall on positive results
BEAR_STAGE_3: 60-70% small cap fall, record FII outflow, VIX>25, under 20% above 200DMA, sentiment collapse
TRANSITION_BEAR_TO_BULL: Exhaustion reversal day, Stage3 bear just ended
TRANSITION_BULL_TO_BEAR: Stage3 bull indicators firing

Return ONLY raw JSON. No markdown. No backticks. All strings under 100 chars.
{"marketStage":"BULL_STAGE_1","overallScore":62,"stageDescription":"Two sentence description based on data","timestamp":"May 2026","lastUpdated":"Data as of 19 May 2026","indicators":{"vix":{"value":"18.3","score":63,"interpretation":"12 words max","trend":"DOWN"},"fiiFlows":{"value":"Rs 14200Cr Apr26","score":67,"interpretation":"12 words max","trend":"UP"},"pctAbove200dma":{"value":"31%","score":31,"interpretation":"12 words max","trend":"UP"},"rupeePerformance":{"value":"Rs84.2 stable","score":50,"interpretation":"12 words max","trend":"STABLE"},"ipoActivity":{"value":"7 IPOs quality only","score":70,"interpretation":"12 words max","trend":"LOW"},"qipActivity":{"value":"Rs4200Cr 2026","score":75,"interpretation":"12 words max","trend":"LOW"},"smallcapPerformance":{"value":"BSE SmCap +15%","score":52,"interpretation":"12 words max","trend":"UP"},"sentimentScore":{"value":"26/100","score":26,"interpretation":"12 words max","trend":"BEARISH"}},"marketOutlook":"3 sentences max","keyRisks":["risk1 max 12 words","risk2","risk3","risk4"]}`;

const STOCKS_PROMPT = `You are an Indian equity analyst. Search the web for current NSE stock data (May 2026).

Gautam Baid quality filter: ROIC>WACC AND competitive moat AND high reinvestment potential (compounding machine).
Current bull themes: Power ancillaries, Defence aerospace, Innovator CDMO pharma, Domestic consumption, Precision engineering exports.

Give exactly 7 HIGH risk (small cap), 7 MEDIUM risk (midcap), 5 LOW risk (large cap). Real NSE tickers only.
Give 5 sector picks.

Return ONLY raw JSON. No markdown. All strings under 80 chars. reasoning max 15 words. catalysts/risks max 8 words each.
{"high":[{"ticker":"SUZLON","name":"Suzlon Energy","sector":"Renewable Energy","cap":"SmMid","verdict":"BUY","return":"50-70%","horizon":"18-24m","reasoning":"15 words max","catalysts":["cat1","cat2","cat3"],"risks":["r1","r2"]},{"ticker":"TICK2","name":"Name2","sector":"Sector","cap":"Small","verdict":"BUY","return":"55-70%","horizon":"18m","reasoning":"reasoning","catalysts":["c1","c2","c3"],"risks":["r1","r2"]},{"ticker":"TICK3","name":"Name3","sector":"Sector","cap":"Small","verdict":"BUY","return":"60-80%","horizon":"24m","reasoning":"reasoning","catalysts":["c1","c2","c3"],"risks":["r1","r2"]},{"ticker":"TICK4","name":"Name4","sector":"Sector","cap":"Small","verdict":"BUY","return":"50-65%","horizon":"18m","reasoning":"reasoning","catalysts":["c1","c2","c3"],"risks":["r1","r2"]},{"ticker":"TICK5","name":"Name5","sector":"Sector","cap":"Small","verdict":"BUY","return":"55-75%","horizon":"20m","reasoning":"reasoning","catalysts":["c1","c2","c3"],"risks":["r1","r2"]},{"ticker":"TICK6","name":"Name6","sector":"Sector","cap":"Small","verdict":"BUY","return":"60-80%","horizon":"24m","reasoning":"reasoning","catalysts":["c1","c2","c3"],"risks":["r1","r2"]},{"ticker":"TICK7","name":"Name7","sector":"Sector","cap":"Small","verdict":"BUY","return":"45-60%","horizon":"18m","reasoning":"reasoning","catalysts":["c1","c2","c3"],"risks":["r1","r2"]}],"medium":[{"ticker":"M1","name":"N","sector":"S","cap":"Mid","verdict":"BUY","return":"30-40%","horizon":"18m","reasoning":"r","catalysts":["c1","c2","c3"],"risks":["r1","r2"]},{"ticker":"M2","name":"N","sector":"S","cap":"Mid","verdict":"BUY","return":"25-35%","horizon":"18m","reasoning":"r","catalysts":["c1","c2","c3"],"risks":["r1","r2"]},{"ticker":"M3","name":"N","sector":"S","cap":"Mid","verdict":"BUY","return":"30-45%","horizon":"18m","reasoning":"r","catalysts":["c1","c2","c3"],"risks":["r1","r2"]},{"ticker":"M4","name":"N","sector":"S","cap":"Mid","verdict":"BUY","return":"25-35%","horizon":"15m","reasoning":"r","catalysts":["c1","c2","c3"],"risks":["r1","r2"]},{"ticker":"M5","name":"N","sector":"S","cap":"Mid","verdict":"BUY","return":"35-50%","horizon":"18m","reasoning":"r","catalysts":["c1","c2","c3"],"risks":["r1","r2"]},{"ticker":"M6","name":"N","sector":"S","cap":"Mid","verdict":"BUY","return":"30-40%","horizon":"18m","reasoning":"r","catalysts":["c1","c2","c3"],"risks":["r1","r2"]},{"ticker":"M7","name":"N","sector":"S","cap":"Mid","verdict":"BUY","return":"25-30%","horizon":"15m","reasoning":"r","catalysts":["c1","c2","c3"],"risks":["r1","r2"]}],"low":[{"ticker":"L1","name":"N","sector":"S","cap":"Large","verdict":"BUY","return":"18-22%","horizon":"12m","reasoning":"r","catalysts":["c1","c2","c3"],"risks":["r1","r2"]},{"ticker":"L2","name":"N","sector":"S","cap":"Large","verdict":"BUY","return":"20-25%","horizon":"12m","reasoning":"r","catalysts":["c1","c2","c3"],"risks":["r1","r2"]},{"ticker":"L3","name":"N","sector":"S","cap":"Large","verdict":"BUY","return":"18-25%","horizon":"12m","reasoning":"r","catalysts":["c1","c2","c3"],"risks":["r1","r2"]},{"ticker":"L4","name":"N","sector":"S","cap":"Large","verdict":"BUY","return":"20-28%","horizon":"15m","reasoning":"r","catalysts":["c1","c2","c3"],"risks":["r1","r2"]},{"ticker":"L5","name":"N","sector":"S","cap":"Large","verdict":"HOLD","return":"12-18%","horizon":"12m","reasoning":"r","catalysts":["c1","c2","c3"],"risks":["r1","r2"]}],"sectors":[{"name":"Power and Energy Ancillaries","conviction":"HIGH","theme":"Theme max 15 words","horizon":"3-5yr"},{"name":"Defence and Aerospace","conviction":"HIGH","theme":"Theme max 15 words","horizon":"5-7yr"},{"name":"Innovator CDMO Pharma","conviction":"HIGH","theme":"Theme max 15 words","horizon":"3-5yr"},{"name":"Domestic Consumption","conviction":"MEDIUM","theme":"Theme max 15 words","horizon":"1-2yr"},{"name":"Auto Ancillary Exports","conviction":"MEDIUM","theme":"Theme max 15 words","horizon":"2-4yr"}]}`;

const STOCK_PROMPT = q => `Analyse NSE/BSE stock "${q}" using Gautam Baid and Warren Buffett value investing framework.
Search web for CURRENT price, latest quarterly results, recent news.
Evaluate: ROIC vs WACC, moat, reinvestment potential, management quality, sectoral tailwind, valuation.
Return ONLY raw JSON. No markdown. All strings under 100 chars.
{"ticker":"TICK","name":"Full Name","sector":"Sector","cap":"Large/Mid/Small Rs XXCr","verdict":"BUY","conviction":"HIGH","price":"Rs XXX","target":"Rs XXX","horizon":"12-18 months","upside":"XX-YY%","biz":{"score":8,"roic":"ROIC vs WACC desc","moat":"moat desc","reinvest":"reinvestment desc","compounder":true},"mgmt":{"score":7,"share":"market share trend","growth":"organic growth desc","margins":"margin consistency"},"val":{"pe":"XX","pb":"X.X","evebitda":"XX","view":"CHEAP"},"tailwind":"STRONG","bull":["reason1","reason2","reason3"],"bear":["risk1","risk2"],"technical":"price vs 200DMA and RS","gbFilter":"PASS plus 1 sentence reason"}`;

// ─── Design tokens ─────────────────────────────────────────────────────────
const C = {
  bg:      "#070d19",
  surface: "#0d1526",
  card:    "#111c32",
  cardHov: "#152035",
  border:  "rgba(255,255,255,0.07)",
  borderB: "rgba(255,255,255,0.12)",
  t1:      "#e8edf5",
  t2:      "#7a90aa",
  t3:      "#3d5570",
  green:   "#00dc82",
  greenD:  "#00a86b",
  greenBg: "rgba(0,220,130,0.1)",
  red:     "#ff4f6e",
  redD:    "#cc2244",
  redBg: "rgba(255,79,110,0.1)",
  amber:   "#ffb020",
  amberBg: "rgba(255,176,32,0.1)",
  blue:    "#4d9fff",
  blueBg:  "rgba(77,159,255,0.1)",
  purple:  "#a78bfa",
  purpleBg:"rgba(167,139,250,0.1)",
};

const STAGE_THEME = {
  BULL_STAGE_1:          { col: C.green,  bg: "linear-gradient(135deg,#021a0e 0%,#042d18 100%)", label: "Bull Market — Stage 1",       short: "BULL S1" },
  BULL_STAGE_2:          { col: C.blue,   bg: "linear-gradient(135deg,#020c1e 0%,#0a2040 100%)", label: "Bull Market — Stage 2",       short: "BULL S2" },
  BULL_STAGE_3:          { col: C.amber,  bg: "linear-gradient(135deg,#1a0e02 0%,#2d1a04 100%)", label: "Bull Market — Stage 3 ⚠",     short: "BULL S3" },
  BEAR_STAGE_1:          { col: C.red,    bg: "linear-gradient(135deg,#1a0204 0%,#2d0508 100%)", label: "Bear Market — Stage 1",       short: "BEAR S1" },
  BEAR_STAGE_2:          { col: C.red,    bg: "linear-gradient(135deg,#1a0204 0%,#3a0609 100%)", label: "Bear Market — Stage 2",       short: "BEAR S2" },
  BEAR_STAGE_3:          { col: C.purple, bg: "linear-gradient(135deg,#100420 0%,#230b42 100%)", label: "Bear Market — Stage 3",       short: "BEAR S3" },
  TRANSITION_BEAR_TO_BULL:{ col: C.green, bg: "linear-gradient(135deg,#021a0e 0%,#042d18 100%)", label: "Transition → New Bull",       short: "RECOVERY"},
  TRANSITION_BULL_TO_BEAR:{ col: C.red,   bg: "linear-gradient(135deg,#1a0204 0%,#2d0508 100%)", label: "Transition → Bear Phase",     short: "CAUTION" },
};

const IND_META = {
  vix:                 { label: "India VIX",      icon: "⚡", bullTrend: "DOWN" },
  fiiFlows:            { label: "FII Net Flows",   icon: "🌏", bullTrend: "UP"   },
  pctAbove200dma:      { label: "% Above 200 DMA", icon: "📊", bullTrend: "UP"   },
  rupeePerformance:    { label: "Rupee / USD",      icon: "₹",  bullTrend: "STABLE"},
  ipoActivity:         { label: "IPO Activity",     icon: "🏦", bullTrend: "LOW"  },
  qipActivity:         { label: "Insider Sales",    icon: "📋", bullTrend: "LOW"  },
  smallcapPerformance: { label: "Small & Midcap",   icon: "📈", bullTrend: "UP"   },
  sentimentScore:      { label: "Retail Sentiment", icon: "🔍", bullTrend: "BULLISH"},
};

const scColor = s => s >= 60 ? C.green : s >= 35 ? C.amber : C.red;
const vColor  = v => v === "BUY" ? C.green : v === "SELL" ? C.red : C.amber;
const vBg     = v => v === "BUY" ? C.greenBg : v === "SELL" ? C.redBg : C.amberBg;

// ─── Mini components ───────────────────────────────────────────────────────
function Pill({ label, color, bg }) {
  return (
    <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 8px", borderRadius: 20,
      background: bg || "rgba(255,255,255,0.06)", color: color || C.t2, letterSpacing: "0.04em",
      border: "1px solid " + (color ? color + "30" : "rgba(255,255,255,0.08)") }}>
      {label}
    </span>
  );
}

function Tag({ label }) {
  return <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 6, background: "rgba(255,255,255,0.05)", color: C.t2, border: "1px solid rgba(255,255,255,0.06)" }}>{label}</span>;
}

function ScoreBar({ score }) {
  const col = scColor(score);
  return (
    <div style={{ height: 3, borderRadius: 2, background: "rgba(255,255,255,0.06)", marginTop: 8 }}>
      <div style={{ width: score + "%", height: "100%", borderRadius: 2,
        background: "linear-gradient(90deg," + col + "99," + col + ")", transition: "width 1.2s ease",
        boxShadow: "0 0 6px " + col + "60" }} />
    </div>
  );
}

function ArcGauge({ score }) {
  const r = 44, circ = 2 * Math.PI * r, arc = circ * 0.72;
  const fill = arc * Math.min(100, Math.max(0, score)) / 100;
  const col  = scColor(score);
  return (
    <div style={{ position: "relative", width: 110, height: 80, margin: "0 auto" }}>
      <svg width="110" height="80" viewBox="0 0 110 80" style={{ overflow: "visible" }}>
        <defs>
          <filter id="glow"><feGaussianBlur stdDeviation="2.5" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        </defs>
        <circle cx="55" cy="68" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="7"
          strokeDasharray={arc + " " + circ} strokeLinecap="round" transform="rotate(-234 55 68)" />
        <circle cx="55" cy="68" r={r} fill="none" stroke={col} strokeWidth="7"
          strokeDasharray={fill + " " + circ} strokeLinecap="round" transform="rotate(-234 55 68)"
          filter="url(#glow)" style={{ transition: "stroke-dasharray 1.4s ease" }} />
        <text x="55" y="62" textAnchor="middle" fontSize="22" fontWeight="700" fill={col}
          fontFamily="'JetBrains Mono',monospace" filter="url(#glow)">{score}</text>
        <text x="55" y="75" textAnchor="middle" fontSize="9" fill={C.t3} fontFamily="system-ui">/ 100</text>
      </svg>
    </div>
  );
}

function IndCard({ id, d, delay }) {
  const m = IND_META[id] || { label: id, icon: "•" };
  const col = scColor(d.score);
  return (
    <div className="bmo-card bmo-fade" style={{ animationDelay: delay + "ms", borderLeft: "2px solid " + col + "60", padding: "14px 16px", position: "relative" }}>
      <div style={{ position: "absolute", top: 12, right: 14, fontSize: 16, opacity: 0.1 }}>{m.icon}</div>
      <div style={{ fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: C.t3, marginBottom: 4 }}>{m.label}</div>
      <div style={{ fontSize: 12, fontWeight: 500, color: C.t2, marginBottom: 8, paddingRight: 20, lineHeight: 1.4 }}>{d.value}</div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <span style={{ fontSize: 28, fontWeight: 700, color: col, lineHeight: 1, fontFamily: "'JetBrains Mono',monospace",
          textShadow: "0 0 20px " + col + "60" }}>{d.score}</span>
        <Pill label={d.trend} color={col} />
      </div>
      <ScoreBar score={d.score} />
      <div style={{ fontSize: 9, color: C.t3, marginTop: 6, lineHeight: 1.5 }}>{d.interpretation}</div>
    </div>
  );
}

function StockCard({ s, accentColor, delay }) {
  const vc = vColor(s.verdict);
  return (
    <div className="bmo-card bmo-fade" style={{ animationDelay: delay + "ms", borderTop: "2px solid " + accentColor + "80", padding: "16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div style={{ flex: 1, minWidth: 0, marginRight: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.t1, fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.04em" }}>{s.ticker}</div>
          <div style={{ fontSize: 10, color: C.t2, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: vBg(s.verdict),
            color: vc, border: "1px solid " + vc + "40", letterSpacing: "0.04em" }}>{s.verdict}</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: vc, marginTop: 4, fontFamily: "'JetBrains Mono',monospace" }}>{s.return}</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 10 }}>
        {[s.sector, s.cap, s.horizon].filter(Boolean).map((t, i) => <Tag key={i} label={t} />)}
      </div>
      <div style={{ fontSize: 11, color: C.t2, lineHeight: 1.6, marginBottom: 10, borderLeft: "2px solid " + accentColor + "40", paddingLeft: 8 }}>{s.reasoning}</div>
      {(s.catalysts || []).length > 0 && (
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 10 }}>
          <div style={{ fontSize: 8, fontWeight: 600, color: C.t3, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Catalysts</div>
          {s.catalysts.map((c, i) => (
            <div key={i} style={{ fontSize: 9, color: C.t2, display: "flex", gap: 6, marginBottom: 3, alignItems: "flex-start" }}>
              <span style={{ color: C.green, fontSize: 8, marginTop: 1, flexShrink: 0 }}>◆</span>{c}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SectorCard({ s, delay }) {
  const high = s.conviction === "HIGH";
  const col  = high ? C.blue : C.amber;
  return (
    <div className="bmo-card bmo-fade" style={{ animationDelay: delay + "ms", padding: "16px", borderTop: "2px solid " + col + "80" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.t1, lineHeight: 1.3, marginRight: 8 }}>{s.name}</div>
        <Pill label={s.conviction} color={col} bg={high ? C.blueBg : C.amberBg} />
      </div>
      <div style={{ fontSize: 10, color: C.t2, lineHeight: 1.6, marginBottom: 10 }}>{s.theme}</div>
      {s.horizon && <Tag label={s.horizon} />}
    </div>
  );
}

function StockResultCard({ r }) {
  if (r.error) return (
    <div style={{ marginTop: 14, padding: 16, background: C.redBg, borderRadius: 10, border: "1px solid " + C.red + "40", fontSize: 11, color: C.red }}>
      Error: {r.error}
    </div>
  );
  const isPass = (r.gbFilter || "").toUpperCase().startsWith("PASS");
  const pCol = isPass ? C.green : C.red;
  const pBg  = isPass ? C.greenBg : C.redBg;
  const note = (r.gbFilter || "").replace(/^(PASS|FAIL)\s*[-—–]?\s*/i, "");
  return (
    <div className="bmo-fade" style={{ marginTop: 16, background: C.card, borderRadius: 12, border: "1px solid " + C.border, overflow: "hidden" }}>
      <div style={{ padding: "16px 20px", background: vBg(r.verdict) + ", " + C.card, borderBottom: "1px solid " + C.border,
        display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10, alignItems: "flex-start" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
            <span style={{ fontSize: 20, fontWeight: 700, color: C.t1, fontFamily: "'JetBrains Mono',monospace" }}>{r.ticker}</span>
            <span style={{ fontSize: 14, fontWeight: 700, padding: "4px 14px", borderRadius: 20,
              background: vBg(r.verdict), color: vColor(r.verdict), border: "1px solid " + vColor(r.verdict) + "40" }}>{r.verdict}</span>
            {r.conviction && <Pill label={r.conviction + " conviction"} color={r.conviction === "HIGH" ? C.blue : C.amber} bg={r.conviction === "HIGH" ? C.blueBg : C.amberBg} />}
          </div>
          <div style={{ fontSize: 13, color: C.t2 }}>{r.name}{r.sector ? " · " + r.sector : ""}</div>
          {r.cap && <div style={{ fontSize: 10, color: C.t3, marginTop: 2 }}>{r.cap}</div>}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 10, color: C.t3, marginBottom: 2 }}>Current → Target</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.t1, fontFamily: "'JetBrains Mono',monospace" }}>{r.price} → {r.target}</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: vColor(r.verdict) }}>{r.upside} · {r.horizon}</div>
        </div>
      </div>

      <div style={{ padding: "16px 20px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
          {r.biz && (
            <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "12px 14px", border: "1px solid " + C.border }}>
              <div style={{ fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: C.t3, marginBottom: 8 }}>Business Quality {r.biz.score}/10</div>
              {[["ROIC", r.biz.roic], ["Moat", r.biz.moat], ["Reinvestment", r.biz.reinvest]].map(([k, v]) => (
                <div key={k} style={{ fontSize: 9, color: C.t2, marginBottom: 4, lineHeight: 1.4 }}>
                  <span style={{ color: C.t1, fontWeight: 500 }}>{k}: </span>{v}
                </div>
              ))}
              {r.biz.compounder && <div style={{ marginTop: 6, fontSize: 9, color: C.green, fontWeight: 600 }}>◆ Compounding Machine</div>}
            </div>
          )}
          {r.mgmt && (
            <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "12px 14px", border: "1px solid " + C.border }}>
              <div style={{ fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: C.t3, marginBottom: 8 }}>Management Quality {r.mgmt.score}/10</div>
              {[["Market Share", r.mgmt.share], ["Growth", r.mgmt.growth], ["Margins", r.mgmt.margins]].map(([k, v]) => (
                <div key={k} style={{ fontSize: 9, color: C.t2, marginBottom: 4, lineHeight: 1.4 }}>
                  <span style={{ color: C.t1, fontWeight: 500 }}>{k}: </span>{v}
                </div>
              ))}
            </div>
          )}
        </div>

        {r.val && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 14 }}>
            {[["P/E", r.val.pe], ["P/B", r.val.pb], ["EV/EBITDA", r.val.evebitda]].map(([k, v]) => (
              <div key={k} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "10px 8px", textAlign: "center", border: "1px solid " + C.border }}>
                <div style={{ fontSize: 8, color: C.t3, marginBottom: 3 }}>{k}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.t1, fontFamily: "'JetBrains Mono',monospace" }}>{v || "—"}</div>
              </div>
            ))}
            <div style={{ background: r.val.view === "CHEAP" ? C.greenBg : r.val.view === "EXPENSIVE" ? C.redBg : C.amberBg, borderRadius: 8, padding: "10px 8px", textAlign: "center", border: "1px solid " + (r.val.view === "CHEAP" ? C.green : r.val.view === "EXPENSIVE" ? C.red : C.amber) + "40" }}>
              <div style={{ fontSize: 8, color: C.t3, marginBottom: 3 }}>Valuation</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: r.val.view === "CHEAP" ? C.green : r.val.view === "EXPENSIVE" ? C.red : C.amber }}>{r.val.view}</div>
            </div>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: C.green, marginBottom: 6 }}>Bull Case</div>
            {(r.bull || []).map((b, i) => (
              <div key={i} style={{ fontSize: 9, color: C.t2, display: "flex", gap: 6, marginBottom: 4 }}>
                <span style={{ color: C.green, flexShrink: 0 }}>↑</span>{b}
              </div>
            ))}
          </div>
          <div>
            <div style={{ fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: C.red, marginBottom: 6 }}>Bear Case</div>
            {(r.bear || []).map((b, i) => (
              <div key={i} style={{ fontSize: 9, color: C.t2, display: "flex", gap: 6, marginBottom: 4 }}>
                <span style={{ color: C.red, flexShrink: 0 }}>↓</span>{b}
              </div>
            ))}
          </div>
        </div>

        {r.technical && (
          <div style={{ fontSize: 9, color: C.t2, padding: "8px 12px", background: "rgba(255,255,255,0.03)", borderRadius: 8, border: "1px solid " + C.border, marginBottom: 12 }}>
            <span style={{ color: C.blue, fontWeight: 600 }}>Technical: </span>{r.technical}
          </div>
        )}

        {r.gbFilter && (
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 14px", borderRadius: 8, background: pBg, border: "1px solid " + pCol + "40" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: pCol, flexShrink: 0, fontFamily: "'JetBrains Mono',monospace" }}>{isPass ? "✓ PASS" : "✗ FAIL"}</span>
            <span style={{ fontSize: 9, color: pCol, lineHeight: 1.5 }}>{note}</span>
          </div>
        )}
      </div>
    </div>
  );
}

const MSGS_1 = ["Fetching India VIX…","Reading FII flows…","Checking 200 DMA breadth…","Analysing rupee data…","Scanning IPO pipeline…","Calibrating market stage…","Finalising indicators…"];
const MSGS_2 = ["Screening Nifty 500…","Applying quality filter…","Checking ROIC vs WACC…","Identifying compounders…","Mapping sector rotation…","Building recommendations…","Finalising stock picks…"];

function Skeleton({ h, w, r }) {
  return <div style={{ height: h || 16, width: w || "100%", borderRadius: r || 4, background: "rgba(255,255,255,0.04)", backgroundImage: "linear-gradient(90deg,rgba(255,255,255,0.02) 0%,rgba(255,255,255,0.06) 50%,rgba(255,255,255,0.02) 100%)", backgroundSize: "400px 100%", animation: "shimmer 2s infinite" }} />;
}

// ─── Main Component Export ───────────────────────────────────────────────────
export default function BharatOracle() {
  const [phase,         setPhase]         = useState("idle");
  const [cycleData,     setCycleData]     = useState(null);
  const [stocksData,    setStocksData]    = useState(null);
  const [activeTab,     setActiveTab]     = useState("high");
  const [stockQuery,    setStockQuery]    = useState("");
  const [stockResult,   setStockResult]   = useState(null);
  const [stockLoading,  setStockLoading]  = useState(false);
  const [step,          setStep]          = useState(0);
  const [msgIdx,        setMsgIdx]        = useState(0);
  const [errMsg,        setErrMsg]        = useState("");
  const [showOutlook,   setShowOutlook]   = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    if (phase === "loading") {
      timer.current = setInterval(() => setMsgIdx(i => (i + 1) % 7), 2300);
    } else clearInterval(timer.current);
    return () => clearInterval(timer.current);
  }, [phase]);

  async function analyseMarket() {
    setPhase("loading"); setStep(0); setMsgIdx(0); setErrMsg("");
    setCycleData(null); setStocksData(null);
    try {
      setStep(0);
      const cycle = await callClaude(CYCLE_PROMPT, 2500);
      setCycleData(cycle);
      setStep(1); setMsgIdx(0);
      const stocks = await callClaude(STOCKS_PROMPT, 5000);
      setStocksData(stocks);
      setPhase("done");
    } catch (e) {
      setErrMsg(e.message || "Analysis failed"); setPhase("error");
    }
    console.log("Testing Key Integration:", import.meta.env.VITE_ANTHROPIC_API_KEY ? "Key Found!" : "Key is Missing");
  }

  async function analyseStock() {
    if (!stockQuery.trim()) return;
    setStockLoading(true); setStockResult(null);
    try { setStockResult(await callClaude(STOCK_PROMPT(stockQuery.trim()), 2500)); }
    catch (e) { setStockResult({ error: e.message }); }
    finally { setStockLoading(false); }
  }

  const st   = cycleData ? (STAGE_THEME[cycleData.marketStage] || STAGE_THEME.BULL_STAGE_1) : null;
  const hi   = stocksData?.high   || [];
  const med  = stocksData?.medium || [];
  const lo   = stocksData?.low    || [];
  const secs = stocksData?.sectors || [];
  const msgs = step === 0 ? MSGS_1 : MSGS_2;

  const TAB_ACCENT = { high: C.red, medium: C.amber, low: C.green };
  const TAB_BANNER = {
    high:   "Small-cap leaders in new bull themes · 50–80% upside potential · Max 3–5% position size",
    medium: "Quality midcap compounders with moats · 25–50% upside potential · Core portfolio picks",
    low:    "Large-cap quality franchises · 15–25% upside · Capital preservation with upside",
  };

  return (
    <div style={{ background: C.bg, minHeight: "100vh", padding: "0 0 40px", fontFamily: "system-ui, sans-serif", color: C.t1, position: "relative" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=JetBrains+Mono:wght@400;500;700&display=swap');
        .bmo-card { background: ${C.card}; border: 1px solid ${C.border}; border-radius: 12px; transition: border-color .2s, transform .15s, box-shadow .2s; }
        .bmo-card:hover { border-color: rgba(255,255,255,0.14); transform: translateY(-1px); box-shadow: 0 8px 32px rgba(0,0,0,0.3); }
        .bmo-fade { animation: bmoFadeIn .45s ease forwards; opacity: 0; }
        @keyframes bmoFadeIn { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        @keyframes shimmer { 0%{background-position:-400px 0} 100%{background-position:400px 0} }
        @keyframes slide { from{transform:translateX(-100%)} to{transform:translateX(400%)} }
        @keyframes spin { from{transform:rotate(0)} to{transform:rotate(360deg)} }
        .bmo-tab { padding:7px 16px; border-radius:20px; font-size:11px; font-weight:600; cursor:pointer; letter-spacing:.02em; transition:all .15s; }
        .bmo-inp { outline:none; }
        .bmo-inp:focus { border-color: ${C.blue} !important; box-shadow: 0 0 0 3px ${C.blueBg}; }
      `}</style>

      {/* ── Topbar ── */}
      <div style={{ background: C.surface, borderBottom: "1px solid " + C.border, padding: "14px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, position: "sticky", top: 0, zIndex: 10, backdropFilter: "blur(12px)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: "-0.03em", fontFamily: "'Syne',sans-serif", color: C.t1, lineHeight: 1 }}>Bharat Market Oracle</div>
            <div style={{ fontSize: 9, color: C.t3, marginTop: 2, letterSpacing: "0.06em", textTransform: "uppercase" }}>Gautam Baid Framework</div>
          </div>
          {st && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 12px", borderRadius: 20, background: C.surface, border: "1px solid " + st.col + "40" }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: st.col, boxShadow: "0 0 6px " + st.col }} />
              <span style={{ fontSize: 10, fontWeight: 600, color: st.col }}>{st.short}</span>
              {cycleData && <span style={{ fontSize: 10, color: C.t3 }}>· {cycleData.overallScore}/100</span>}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {cycleData && <span style={{ fontSize: 9, color: C.t3 }}>{cycleData.lastUpdated}</span>}
          <button onClick={analyseMarket} disabled={phase === "loading"}
            style={{ padding: "8px 20px", fontSize: 12, fontWeight: 700, cursor: phase === "loading" ? "wait" : "pointer", borderRadius: 8,
              border: "1px solid " + C.blue + "50", background: phase === "loading" ? "rgba(77,159,255,0.1)" : "linear-gradient(135deg," + C.blue + "," + C.blue + "cc)",
              color: phase === "loading" ? C.t3 : "#fff", letterSpacing: ".02em", opacity: phase === "loading" ? 0.6 : 1,
              boxShadow: phase === "loading" ? "none" : "0 4px 14px rgba(77,159,255,0.35)" }}>
            {phase === "loading" ? "Analysing…" : cycleData ? "Re-analyse ↗" : "Analyse Market ↗"}
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "28px 28px 0" }}>

        {/* ── Idle placeholder ── */}
        {phase === "idle" && (
          <div style={{ textAlign: "center", padding: "64px 20px" }}>
            <div style={{ fontSize: 40, marginBottom: 20 }}>📊</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: C.t1, marginBottom: 10, fontFamily: "'Syne',sans-serif", letterSpacing: "-0.02em" }}>Indian Market Cycle Analyser</div>
            <div style={{ fontSize: 13, color: C.t2, lineHeight: 1.7, maxWidth: 440, margin: "0 auto 28px" }}>
              Scores 8 live indicators · Detects bull/bear stage · Surfaces 20+ stock picks across risk profiles using Gautam Baid's framework
            </div>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", marginBottom: 32 }}>
              {["India VIX", "FII Flows", "200 DMA %", "Rupee", "IPO Pipeline", "QIP Activity", "SmallCap Index", "Retail Sentiment"].map((t, i) => (
                <span key={i} style={{ fontSize: 10, padding: "4px 10px", borderRadius: 20, background: C.card, color: C.t3, border: "1px solid " + C.border }}>{t}</span>
              ))}
            </div>
            <button onClick={analyseMarket} style={{ padding: "12px 32px", fontSize: 14, fontWeight: 700, cursor: "pointer", borderRadius: 10, border: "none",
              background: "linear-gradient(135deg," + C.blue + "," + C.blue + "aa)", color: "#fff", boxShadow: "0 6px 24px rgba(77,159,255,0.4)", letterSpacing: ".02em" }}>
              Analyse Market Now ↗
            </button>
            <div style={{ fontSize: 10, color: C.t3, marginTop: 12 }}>2 API calls · Live web search · ~60 seconds</div>
          </div>
        )}

        {/* ── Loading ── */}
        {phase === "loading" && (
          <div>
            <div style={{ background: C.card, borderRadius: 12, border: "1px solid " + C.border, padding: "24px 28px", marginBottom: 24, display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", border: "3px solid " + C.blue + "40", borderTopColor: C.blue, animation: "spin 1s linear infinite", flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: C.t3, marginBottom: 4 }}>Step {step + 1} of 2 — {step === 0 ? "Market Cycle Analysis" : "Stock Recommendations"}</div>
                <div style={{ fontSize: 15, fontWeight: 500, color: C.t1 }}>{msgs[msgIdx]}</div>
                <div style={{ fontSize: 10, color: C.t3, marginTop: 2 }}>Searching live Indian market data…</div>
              </div>
              {step === 1 && cycleData && st && (
                <div style={{ marginLeft: "auto", padding: "8px 16px", borderRadius: 10, background: st.bg, border: "1px solid " + st.col + "40" }}>
                  <div style={{ fontSize: 9, color: C.t3, marginBottom: 2 }}>Confirmed Stage</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: st.col }}>{st.short}</div>
                </div>
              )}
            </div>
            <div style={{ height: 2, background: C.card, borderRadius: 1, overflow: "hidden", marginBottom: 24 }}>
              <div style={{ height: "100%", width: "30%", background: C.blue, borderRadius: 1, animation: "slide 2s linear infinite" }} />
            </div>
            {step === 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10 }}>
                {Array(8).fill(0).map((_, i) => (
                  <div key={i} className="bmo-card" style={{ padding: 16, animationDelay: i * 60 + "ms" }}>
                    <Skeleton h={8} w="60%" r={4} />
                    <div style={{ marginTop: 10 }}><Skeleton h={14} w="80%" /></div>
                    <div style={{ marginTop: 8 }}><Skeleton h={28} w="40%" r={4} /></div>
                    <div style={{ marginTop: 8 }}><Skeleton h={3} r={2} /></div>
                    <div style={{ marginTop: 8 }}><Skeleton h={8} r={4} /></div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Error ── */}
        {phase === "error" && (
          <div style={{ padding: "16px 20px", background: C.redBg, borderRadius: 10, border: "1px solid " + C.red + "40", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.red, marginBottom: 2 }}>Analysis Error</div>
              <div style={{ fontSize: 11, color: C.t2 }}>{errMsg}</div>
            </div>
            <button onClick={analyseMarket} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid " + C.red + "50", background: C.redBg, color: C.red, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Retry ↗</button>
          </div>
        )}

        {/* ── Market Stage Hero ── */}
        {cycleData && st && (
          <div className="bmo-fade" style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 14, marginBottom: 24, alignItems: "stretch" }}>
            <div style={{ background: st.bg, borderRadius: 14, border: "1px solid " + st.col + "30", padding: "22px 24px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: st.col + "99", marginBottom: 8 }}>Current Market Stage</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: st.col, fontFamily: "'Syne',sans-serif", letterSpacing: "-0.02em", marginBottom: 12, textShadow: "0 0 40px " + st.col + "40" }}>{st.label}</div>
                <div style={{ fontSize: 11, color: C.t2, lineHeight: 1.7 }}>{cycleData.stageDescription}</div>
              </div>
              <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
                {(cycleData.keyRisks || []).slice(0, 2).map((r, i) => (
                  <div key={i} style={{ fontSize: 9, color: C.red + "cc", display: "flex", gap: 5, alignItems: "flex-start" }}>
                    <span style={{ flexShrink: 0 }}>⚠</span>{r}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 8px" }}>
              <ArcGauge score={cycleData.overallScore || 0} />
              <div style={{ fontSize: 8, color: C.t3, marginTop: 4, textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600 }}>Bull Strength</div>
            </div>

            <div style={{ background: C.card, borderRadius: 14, border: "1px solid " + C.border, padding: "22px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <div style={{ fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: C.t3, marginBottom: 6 }}>Data Snapshot</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: C.t1, fontFamily: "'Syne',sans-serif" }}>{cycleData.timestamp}</div>
                <div style={{ fontSize: 10, color: C.t3, marginTop: 2 }}>{cycleData.lastUpdated}</div>
              </div>
              <div style={{ borderTop: "1px solid " + C.border, paddingTop: 14 }}>
                <div style={{ fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: C.red + "cc", marginBottom: 8 }}>Key Risks</div>
                {(cycleData.keyRisks || []).map((r, i) => (
                  <div key={i} style={{ fontSize: 9, color: C.t2, display: "flex", gap: 6, marginBottom: 5, alignItems: "flex-start" }}>
                    <span style={{ color: C.red, flexShrink: 0, marginTop: 1 }}>!</span>{r}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Indicators ── */}
        {cycleData && (
          <div style={{ marginBottom: 28 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: C.t3 }}>8 Market Cycle Indicators</div>
              <div style={{ flex: 1, height: 1, background: C.border }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(155px,1fr))", gap: 10 }}>
              {Object.entries(cycleData.indicators || {}).map(([id, d], i) => <IndCard key={id} id={id} d={d} delay={i * 60} />)}
            </div>
          </div>
        )}

        {/* ── Stocks ── */}
        {phase === "done" && stocksData && (
          <div style={{ marginBottom: 28 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: C.t3 }}>Stock Recommendations</div>
              <div style={{ flex: 1, height: 1, background: C.border }} />
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
              {[["high","High Risk",hi.length],["medium","Medium Risk",med.length],["low","Low Risk",lo.length]].map(([t, label, count]) => (
                <button key={t} className="bmo-tab" onClick={() => setActiveTab(t)} style={{
                  background: activeTab === t ? TAB_ACCENT[t] : "transparent",
                  color: activeTab === t ? "#000" : C.t2,
                  border: "1px solid " + (activeTab === t ? TAB_ACCENT[t] : C.border),
                  boxShadow: activeTab === t ? "0 4px 14px " + TAB_ACCENT[t] + "50" : "none"
                }}>
                  {label} <span style={{ opacity: 0.7 }}>({count})</span>
                </button>
              ))}
            </div>
            <div style={{ padding: "8px 14px", borderRadius: 8, background: TAB_ACCENT[activeTab] + "12", border: "1px solid " + TAB_ACCENT[activeTab] + "30", fontSize: 10, color: TAB_ACCENT[activeTab], marginBottom: 14 }}>
              {TAB_BANNER[activeTab]}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(265px,1fr))", gap: 12 }}>
              {(activeTab === "high" ? hi : activeTab === "medium" ? med : lo).map((s, i) => (
                <StockCard key={i} s={s} accentColor={TAB_ACCENT[activeTab]} delay={i * 50} />
              ))}
            </div>
          </div>
        )}

        {/* ── Sectors ── */}
        {phase === "done" && secs.length > 0 && (
          <div style={{ marginBottom: 28 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: C.t3 }}>Sector Rotation — {st ? st.short : ""} Cycle</div>
              <div style={{ flex: 1, height: 1, background: C.border }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 10 }}>
              {secs.map((s, i) => <SectorCard key={i} s={s} delay={i * 60} />)}
            </div>
          </div>
        )}

        {/* ── Market Outlook ── */}
        {cycleData && cycleData.marketOutlook && phase === "done" && (
          <div style={{ marginBottom: 28 }}>
            <button onClick={() => setShowOutlook(o => !o)} style={{ width: "100%", padding: "14px 20px", background: C.card, borderRadius: 12, border: "1px solid " + C.border, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", color: C.t1, fontSize: 12, fontWeight: 600 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 14 }}>📋</span>
                Market Outlook &amp; Cycle Analysis
              </div>
              <span style={{ color: C.t3, fontSize: 10, fontWeight: 400 }}>{showOutlook ? "collapse ↑" : "expand ↓"}</span>
            </button>
            {showOutlook && (
              <div className="bmo-fade" style={{ background: C.card, borderRadius: "0 0 12px 12px", border: "1px solid " + C.border, borderTop: "none", padding: "20px 24px" }}>
                <p style={{ fontSize: 12, color: C.t2, lineHeight: 1.8, marginBottom: 16 }}>{cycleData.marketOutlook}</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 8 }}>
                  {(cycleData.keyRisks || []).map((r, i) => (
                    <div key={i} style={{ padding: "8px 12px", background: C.redBg, borderRadius: 8, border: "1px solid " + C.red + "20", display: "flex", gap: 8, fontSize: 10, color: C.t2 }}>
                      <span style={{ color: C.red, flexShrink: 0 }}>!</span>{r}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Stock Search ── */}
        <div style={{ background: C.card, borderRadius: 14, border: "1px solid " + C.border, padding: "22px 24px", marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, flexWrap: "wrap", gap: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.t1, fontFamily: "'Syne',sans-serif" }}>Analyse Any Stock</div>
            <Pill label="BUY / SELL / HOLD + GB Filter" color={C.blue} bg={C.blueBg} />
          </div>
          <div style={{ fontSize: 11, color: C.t3, marginBottom: 16, lineHeight: 1.5 }}>Enter any NSE ticker or company name · Full Gautam Baid quality filter · Live web search</div>
          <div style={{ display: "flex", gap: 10 }}>
            <input
              className="bmo-inp"
              value={stockQuery}
              onChange={e => setStockQuery(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") analyseStock(); }}
              placeholder="RELIANCE, INFY, HDFCBANK, Suzlon, Tata Motors…"
              style={{ flex: 1, minWidth: 0, padding: "10px 14px", fontSize: 12, borderRadius: 8, border: "1px solid " + C.border, background: "rgba(255,255,255,0.04)", color: C.t1, transition: "border .2s, box-shadow .2s" }}
            />
            <button onClick={analyseStock} disabled={stockLoading || !stockQuery.trim()}
              style={{ padding: "10px 22px", fontSize: 12, fontWeight: 700, cursor: (stockLoading || !stockQuery.trim()) ? "not-allowed" : "pointer", borderRadius: 8,
                border: "none", background: (stockLoading || !stockQuery.trim()) ? "rgba(77,159,255,0.2)" : "linear-gradient(135deg," + C.blue + "," + C.blue + "cc)",
                color: (stockLoading || !stockQuery.trim()) ? C.t3 : "#fff", flexShrink: 0, letterSpacing: ".02em",
                boxShadow: (!stockLoading && stockQuery.trim()) ? "0 4px 14px rgba(77,159,255,0.35)" : "none" }}>
              {stockLoading ? "…" : "Analyse ↗"}
            </button>
          </div>
          {stockLoading && (
            <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 12, height: 12, borderRadius: "50%", border: "2px solid " + C.blue + "40", borderTopColor: C.blue, animation: "spin 1s linear infinite" }} />
              <span style={{ fontSize: 10, color: C.t3 }}>Fetching live data for "{stockQuery}" · Applying quality filter…</span>
            </div>
          )}
          {stockResult && <StockResultCard r={stockResult} />}
        </div>

        <div style={{ textAlign: "center", fontSize: 9, color: C.t3, letterSpacing: "0.04em" }}>
          Based on Gautam Baid's "The Joys of Compounding" · Not financial advice · Educational use only
        </div>
      </div>
    </div>
  );
}