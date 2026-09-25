import { useMemo, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend, AreaChart, Area
} from "recharts";
import { Plane, Database, Filter, Calculator, LayoutDashboard, Code2, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, Copy } from "lucide-react";

// ---------------------------------------------------------------------------
// Seeded PRNG so the "collected" data is stable across renders
// ---------------------------------------------------------------------------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260909);
const gauss = () => {
  let u = 0, v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

// ---------------------------------------------------------------------------
// Universe: routes, airlines, booking windows
// ---------------------------------------------------------------------------
const ROUTES = [
  { code: "DEL-BOM", name: "Delhi \u2194 Mumbai", base: 5500, weight: 0.24 },
  { code: "DEL-BLR", name: "Delhi \u2194 Bengaluru", base: 6200, weight: 0.19 },
  { code: "BOM-BLR", name: "Mumbai \u2194 Bengaluru", base: 5000, weight: 0.15 },
  { code: "DEL-MAA", name: "Delhi \u2194 Chennai", base: 6800, weight: 0.14 },
  { code: "DEL-CCU", name: "Delhi \u2194 Kolkata", base: 6500, weight: 0.13 },
  { code: "BOM-GOI", name: "Mumbai \u2194 Goa", base: 4200, weight: 0.15 },
];
const AIRLINES = [
  { name: "IndiGo", mult: 0.94 },
  { name: "Air India", mult: 1.05 },
  { name: "SpiceJet", mult: 0.97 },
  { name: "Akasa Air", mult: 0.96 },
  { name: "Vistara", mult: 1.14 },
];
const WINDOWS = [
  { label: "T+1", mult: 1.55, availMult: 0.5 },
  { label: "T+7", mult: 1.22, availMult: 0.7 },
  { label: "T+15", mult: 1.0, availMult: 0.9 },
  { label: "T+30", mult: 0.86, availMult: 1.1 },
  { label: "T+45", mult: 0.78, availMult: 1.3 },
];
const DAYS = 60;

// ---------------------------------------------------------------------------
// STAGE 1 — Simulated collection (stands in for live scraping of airline /
// OTA sites, which this sandbox has no network access to perform)
// ---------------------------------------------------------------------------
function collectRawRecords() {
  const records = [];
  let ts = Date.now();
  ROUTES.forEach((route) => {
    // a slow drift + a mid-series demand shock (e.g. festival travel window)
    const drift = (gauss() * 0.05);
    for (let day = 0; day < DAYS; day++) {
      const seasonal = 1 + 0.10 * Math.sin((day / 7) * Math.PI * 2 - 1) * 0.4
        + (day > 35 && day < 45 ? 0.12 : 0); // demand shock
      const dayTrend = 1 + drift * (day / DAYS);
      AIRLINES.forEach((al) => {
        WINDOWS.forEach((w) => {
          const noise = 1 + gauss() * 0.035;
          const fare = Math.round(route.base * al.mult * w.mult * seasonal * dayTrend * noise / 10) * 10;
          const taxes = Math.round(fare * (0.10 + rand() * 0.04));
          const availability = Math.max(0, Math.round((9 + gauss() * 4) * w.availMult));
          records.push({
            id: `${route.code}-${al.name}-${w.label}-${day}`,
            route: route.code,
            airline: al.name,
            window: w.label,
            day,
            fare,
            taxes,
            total: fare + taxes,
            availability,
            searchTs: ts - (DAYS - day) * 86400000,
          });
        });
      });
    }
  });

  // Inject data-quality problems for the cleaning stage to catch
  const dirty = [...records];
  // 1) duplicates
  for (let i = 0; i < 40; i++) dirty.push({ ...records[Math.floor(rand() * records.length)] });
  // 2) missing / invalid values
  for (let i = 0; i < 25; i++) {
    const idx = Math.floor(rand() * dirty.length);
    dirty[idx] = { ...dirty[idx], fare: rand() < 0.5 ? null : -1 };
  }
  // 3) extreme outliers (fat-fingered fares, scraper glitches)
  for (let i = 0; i < 15; i++) {
    const idx = Math.floor(rand() * dirty.length);
    dirty[idx] = { ...dirty[idx], fare: Math.round(dirty[idx].fare * (rand() < 0.5 ? 8 : 0.05)) };
  }
  return dirty;
}

// ---------------------------------------------------------------------------
// STAGE 2 — Cleaning & standardisation
// ---------------------------------------------------------------------------
function cleanRecords(raw) {
  const seen = new Set();
  const stats = { input: raw.length, duplicates: 0, missing: 0, outliers: 0 };
  let rows = [];

  raw.forEach((r) => {
    if (seen.has(r.id) && rows.find(x => x.id === r.id)) { stats.duplicates++; return; }
    seen.add(r.id);
    if (r.fare == null || r.fare <= 0) { stats.missing++; return; }
    rows.push(r);
  });

  // outlier detection per route+window group via IQR
  const groups = {};
  rows.forEach((r) => {
    const k = `${r.route}-${r.window}`;
    (groups[k] = groups[k] || []).push(r);
  });
  const clean = [];
  Object.values(groups).forEach((g) => {
    const fares = g.map(r => r.fare).sort((a, b) => a - b);
    const q1 = fares[Math.floor(fares.length * 0.25)];
    const q3 = fares[Math.floor(fares.length * 0.75)];
    const iqr = q3 - q1;
    const lo = q1 - 2.5 * iqr, hi = q3 + 2.5 * iqr;
    g.forEach((r) => {
      if (r.fare < lo || r.fare > hi) { stats.outliers++; return; }
      clean.push(r);
    });
  });
  stats.output = clean.length;
  return { clean, stats };
}

// ---------------------------------------------------------------------------
// STAGE 3 — Index calculation (Jevons + Fisher), route-wise and national
// ---------------------------------------------------------------------------
function buildIndices(clean) {
  const byRouteDay = {};
  clean.forEach((r) => {
    const k = r.route;
    byRouteDay[k] = byRouteDay[k] || Array.from({ length: DAYS }, () => []);
    byRouteDay[k][r.day].push(r);
  });

  const routeSeries = {};
  ROUTES.forEach(({ code }) => {
    const byDay = byRouteDay[code] || [];
    const base = byDay[0] || [];
    const baseMap = {};
    base.forEach((r) => { baseMap[`${r.airline}-${r.window}`] = r; });

    const series = [];
    for (let day = 0; day < DAYS; day++) {
      const items = byDay[day] || [];
      const relatives = [];
      let lasNum = 0, lasDen = 0, pasNum = 0, pasDen = 0;
      items.forEach((r) => {
        const b = baseMap[`${r.airline}-${r.window}`];
        if (!b) return;
        const ratio = r.fare / b.fare;
        relatives.push(ratio);
        // weights proxied by (inverse of) availability -> scarcer fares matter more
        const w0 = 1 / Math.max(1, b.availability);
        const wt = 1 / Math.max(1, r.availability);
        lasNum += w0 * r.fare; lasDen += w0 * b.fare;
        pasNum += wt * r.fare; pasDen += wt * b.fare;
      });
      const jevons = relatives.length
        ? 100 * Math.exp(relatives.reduce((s, x) => s + Math.log(x), 0) / relatives.length)
        : (series[day - 1]?.jevons ?? 100);
      const laspeyres = lasDen ? (lasNum / lasDen) : 1;
      const paasche = pasDen ? (pasNum / pasDen) : 1;
      const fisher = 100 * Math.sqrt(laspeyres * paasche);
      const avgFare = items.length ? items.reduce((s, r) => s + r.total, 0) / items.length : null;
      series.push({ day, jevons: Math.round(jevons * 100) / 100, fisher: Math.round(fisher * 100) / 100, avgFare: avgFare ? Math.round(avgFare) : null, n: items.length });
    }
    routeSeries[code] = series;
  });

  const national = [];
  for (let day = 0; day < DAYS; day++) {
    let jSum = 0, fSum = 0, wSum = 0;
    ROUTES.forEach(({ code, weight }) => {
      const pt = routeSeries[code][day];
      jSum += pt.jevons * weight; fSum += pt.fisher * weight; wSum += weight;
    });
    national.push({ day, jevons: Math.round((jSum / wSum) * 100) / 100, fisher: Math.round((fSum / wSum) * 100) / 100 });
  }
  return { routeSeries, national };
}

// ---------------------------------------------------------------------------
// Small presentational helpers
// ---------------------------------------------------------------------------
const ink = "#0E1626", panel = "#141F35", panelAlt = "#182747", line = "#28395C",
  text = "#E9EEF7", muted = "#8CA0C4", marigold = "#E7A23A", teal = "#3FB39A", rose = "#E06B6B";

function Delta({ value }) {
  const up = value >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: up ? rose : teal, fontSize: 13, fontWeight: 600 }}>
      <Icon size={14} />{Math.abs(value).toFixed(1)}%
    </span>
  );
}

function Card({ children, style }) {
  return (
    <div style={{ background: panel, border: `1px solid ${line}`, borderRadius: 10, padding: 18, ...style }}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function AIRX() {
  const [tab, setTab] = useState("overview");
  const [selRoute, setSelRoute] = useState(ROUTES[0].code);
  const [apiRoute, setApiRoute] = useState(ROUTES[0].code);
  const [copied, setCopied] = useState(false);

  const raw = useMemo(() => collectRawRecords(), []);
  const { clean, stats } = useMemo(() => cleanRecords(raw), [raw]);
  const { routeSeries, national } = useMemo(() => buildIndices(clean), [clean]);

  const latestNat = national[national.length - 1];
  const firstNat = national[0];
  const natChange = ((latestNat.fisher - firstNat.fisher) / firstNat.fisher) * 100;
  const weekAgoNat = national[national.length - 8] || firstNat;
  const natWeekChange = ((latestNat.fisher - weekAgoNat.fisher) / weekAgoNat.fisher) * 100;

  const tabs = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "routes", label: "Routes & Airlines", icon: Plane },
    { id: "pipeline", label: "Data Pipeline", icon: Database },
    { id: "api", label: "API", icon: Code2 },
  ];

  // ---- sample API payload for the API tab ----
  const apiSeries = routeSeries[apiRoute];
  const apiLatest = apiSeries[apiSeries.length - 1];
  const sampleResponse = {
    route: apiRoute,
    as_of_day: apiLatest.day,
    generated_at: new Date().toISOString(),
    index_base: 100,
    jevons_index: apiLatest.jevons,
    fisher_index: apiLatest.fisher,
    avg_fare_inr: apiLatest.avgFare,
    observations_used: apiLatest.n,
    methodology: "Fisher (Laspeyres x Paasche, geometric mean), availability-weighted",
  };

  return (
    <div style={{ fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif", background: ink, color: text, minHeight: "100%", padding: "0 0 32px" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Fraunces:opsz,wght@9..144,400;9..144,600&display=swap');
        * { box-sizing: border-box; }
        .airx-mono { font-variant-numeric: tabular-nums; }
        .airx-tab-btn { transition: color .15s ease, background .15s ease; }
        .airx-scroll::-webkit-scrollbar { height: 6px; }
        .airx-scroll::-webkit-scrollbar-thumb { background: ${line}; border-radius: 4px; }
        select { color-scheme: dark; }
      `}</style>

      {/* Header */}
      <div style={{ padding: "22px 28px 18px", borderBottom: `1px solid ${line}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 9, background: marigold, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Plane size={20} color={ink} />
          </div>
          <div>
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 600, lineHeight: 1 }}>AIRX</div>
            <div style={{ fontSize: 12.5, color: muted, marginTop: 2 }}>Airfare Price Index for India \u2014 prototype</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, background: panel, padding: 4, borderRadius: 10, border: `1px solid ${line}` }}>
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button key={t.id} className="airx-tab-btn" onClick={() => setTab(t.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 7, padding: "8px 13px", borderRadius: 7,
                  border: "none", cursor: "pointer", fontSize: 13.5, fontWeight: 600,
                  background: active ? marigold : "transparent", color: active ? ink : muted,
                }}>
                <Icon size={15} /> {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ padding: "24px 28px" }}>
        {tab === "overview" && (
          <Overview national={national} routeSeries={routeSeries} latestNat={latestNat}
            natChange={natChange} natWeekChange={natWeekChange} onOpenRoute={(c) => { setSelRoute(c); setTab("routes"); }} />
        )}
        {tab === "routes" && (
          <RoutesTab selRoute={selRoute} setSelRoute={setSelRoute} routeSeries={routeSeries} clean={clean} />
        )}
        {tab === "pipeline" && <PipelineTab stats={stats} raw={raw} clean={clean} />}
        {tab === "api" && (
          <ApiTab apiRoute={apiRoute} setApiRoute={setApiRoute} sampleResponse={sampleResponse} copied={copied} setCopied={setCopied} />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function Overview({ national, routeSeries, latestNat, natChange, natWeekChange, onOpenRoute }) {
  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 20 }}>
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
            <div>
              <div style={{ fontSize: 12.5, color: muted, fontWeight: 600 }}>National AIRX (Fisher, base = 100)</div>
              <div className="airx-mono" style={{ fontFamily: "'Fraunces', serif", fontSize: 46, fontWeight: 600, marginTop: 4 }}>
                {latestNat.fisher.toFixed(1)}
              </div>
              <div style={{ display: "flex", gap: 14, marginTop: 6 }}>
                <div style={{ fontSize: 12.5, color: muted }}>60-day <Delta value={natChange} /></div>
                <div style={{ fontSize: 12.5, color: muted }}>7-day <Delta value={natWeekChange} /></div>
              </div>
            </div>
            <div style={{ fontSize: 12, color: muted, textAlign: "right", maxWidth: 220 }}>
              Weighted average of route-wise indices across {ROUTES.length} routes, {AIRLINES.length} airlines and {WINDOWS.length} advance-booking windows.
            </div>
          </div>
          <div style={{ height: 220, marginTop: 14 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={national}>
                <defs>
                  <linearGradient id="fillFisher" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={marigold} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={marigold} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={line} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" tick={{ fill: muted, fontSize: 11 }} tickFormatter={(d) => `D${d}`} axisLine={{ stroke: line }} tickLine={false} />
                <YAxis domain={["auto", "auto"]} tick={{ fill: muted, fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
                <Tooltip contentStyle={{ background: panelAlt, border: `1px solid ${line}`, borderRadius: 8, fontSize: 12 }} labelFormatter={(d) => `Day ${d}`} />
                <Area type="monotone" dataKey="fisher" name="Fisher index" stroke={marigold} fill="url(#fillFisher)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="jevons" name="Jevons index" stroke={teal} strokeWidth={1.5} dot={false} strokeDasharray="4 3" />
                <Legend wrapperStyle={{ fontSize: 12, color: muted }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: 12.5, color: muted, fontWeight: 600, marginBottom: 10 }}>Index composition</div>
          <div style={{ display: "grid", gap: 8 }}>
            {ROUTES.map((r) => {
              const s = routeSeries[r.code];
              const chg = ((s[s.length - 1].fisher - s[0].fisher) / s[0].fisher) * 100;
              return (
                <div key={r.code} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", background: panelAlt, borderRadius: 8, cursor: "pointer" }}
                  onClick={() => onOpenRoute(r.code)}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{r.name}</div>
                    <div style={{ fontSize: 11, color: muted }}>weight {(r.weight * 100).toFixed(0)}%</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="airx-mono" style={{ fontSize: 14, fontWeight: 700 }}>{s[s.length - 1].fisher.toFixed(1)}</div>
                    <Delta value={chg} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <Card>
        <div style={{ fontSize: 12.5, color: muted, fontWeight: 600, marginBottom: 12 }}>Route-wise index trend (Fisher, base = 100)</div>
        <div style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={national.map((n, i) => {
              const row = { day: n.day };
              ROUTES.forEach((r) => row[r.code] = routeSeries[r.code][i].fisher);
              return row;
            })}>
              <CartesianGrid stroke={line} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="day" tick={{ fill: muted, fontSize: 11 }} tickFormatter={(d) => `D${d}`} axisLine={{ stroke: line }} tickLine={false} />
              <YAxis tick={{ fill: muted, fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
              <Tooltip contentStyle={{ background: panelAlt, border: `1px solid ${line}`, borderRadius: 8, fontSize: 12 }} labelFormatter={(d) => `Day ${d}`} />
              <Legend wrapperStyle={{ fontSize: 11.5, color: muted }} />
              {ROUTES.map((r, i) => (
                <Line key={r.code} type="monotone" dataKey={r.code} name={r.code} strokeWidth={1.8} dot={false}
                  stroke={[marigold, teal, rose, "#6C9BD8", "#B08BD9", "#D9A96C"][i % 6]} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
function RoutesTab({ selRoute, setSelRoute, routeSeries, clean }) {
  const series = routeSeries[selRoute];
  const latestDay = series[series.length - 1].day;
  const latestByAirline = {};
  clean.filter(r => r.route === selRoute && r.day === latestDay).forEach((r) => {
    latestByAirline[r.airline] = latestByAirline[r.airline] || [];
    latestByAirline[r.airline].push(r);
  });
  const airlineAvg = AIRLINES.map((al) => {
    const rows = latestByAirline[al.name] || [];
    const avg = rows.length ? rows.reduce((s, r) => s + r.total, 0) / rows.length : 0;
    return { name: al.name, avg: Math.round(avg) };
  });
  const windowRows = WINDOWS.map((w) => {
    const rows = clean.filter(r => r.route === selRoute && r.day === latestDay && r.window === w.label);
    const avg = rows.length ? Math.round(rows.reduce((s, r) => s + r.total, 0) / rows.length) : null;
    const cheapest = rows.length ? rows.reduce((a, b) => a.total < b.total ? a : b) : null;
    return { window: w.label, avg, cheapest };
  });

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {ROUTES.map((r) => (
          <button key={r.code} onClick={() => setSelRoute(r.code)}
            style={{
              padding: "8px 14px", borderRadius: 20, border: `1px solid ${selRoute === r.code ? marigold : line}`,
              background: selRoute === r.code ? "rgba(231,162,58,0.12)" : panel, color: selRoute === r.code ? marigold : muted,
              fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}>
            {r.name}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 20 }}>
        <Card>
          <div style={{ fontSize: 12.5, color: muted, fontWeight: 600, marginBottom: 12 }}>{selRoute} \u2014 Jevons vs Fisher</div>
          <div style={{ height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series}>
                <CartesianGrid stroke={line} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" tick={{ fill: muted, fontSize: 11 }} tickFormatter={(d) => `D${d}`} axisLine={{ stroke: line }} tickLine={false} />
                <YAxis tick={{ fill: muted, fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
                <Tooltip contentStyle={{ background: panelAlt, border: `1px solid ${line}`, borderRadius: 8, fontSize: 12 }} labelFormatter={(d) => `Day ${d}`} />
                <Legend wrapperStyle={{ fontSize: 12, color: muted }} />
                <Line type="monotone" dataKey="fisher" name="Fisher" stroke={marigold} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="jevons" name="Jevons" stroke={teal} strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: 12.5, color: muted, fontWeight: 600, marginBottom: 12 }}>Avg all-in fare by airline (latest)</div>
          <div style={{ height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={airlineAvg} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid stroke={line} strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fill: muted, fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fill: text, fontSize: 12 }} axisLine={false} tickLine={false} width={80} />
                <Tooltip contentStyle={{ background: panelAlt, border: `1px solid ${line}`, borderRadius: 8, fontSize: 12 }} formatter={(v) => [`\u20b9${v}`, "Avg fare"]} />
                <Bar dataKey="avg" fill={marigold} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card>
        <div style={{ fontSize: 12.5, color: muted, fontWeight: 600, marginBottom: 12 }}>Fare by advance-booking window (latest snapshot, {selRoute})</div>
        <div className="airx-scroll" style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ color: muted, textAlign: "left" }}>
                <th style={{ padding: "6px 10px" }}>Window</th>
                <th style={{ padding: "6px 10px" }}>Avg all-in fare</th>
                <th style={{ padding: "6px 10px" }}>Cheapest airline</th>
                <th style={{ padding: "6px 10px" }}>Cheapest fare</th>
              </tr>
            </thead>
            <tbody>
              {windowRows.map((w) => (
                <tr key={w.window} style={{ borderTop: `1px solid ${line}` }}>
                  <td style={{ padding: "8px 10px", fontWeight: 600 }}>{w.window}</td>
                  <td className="airx-mono" style={{ padding: "8px 10px" }}>{w.avg ? `\u20b9${w.avg.toLocaleString("en-IN")}` : "\u2014"}</td>
                  <td style={{ padding: "8px 10px" }}>{w.cheapest?.airline ?? "\u2014"}</td>
                  <td className="airx-mono" style={{ padding: "8px 10px" }}>{w.cheapest ? `\u20b9${w.cheapest.total.toLocaleString("en-IN")}` : "\u2014"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
function PipelineTab({ stats, raw, clean }) {
  const sampleDirty = raw.find(r => r.fare == null || r.fare < 0) || raw[0];
  const sampleClean = clean[0];
  const stages = [
    { icon: Database, title: "1. Automated collection", body: `${stats.input.toLocaleString("en-IN")} fare observations captured across ${ROUTES.length} routes \u00d7 ${AIRLINES.length} airlines \u00d7 ${WINDOWS.length} booking windows \u00d7 ${DAYS} days.` },
    { icon: Filter, title: "2. Cleaning & standardisation", body: `${stats.duplicates} duplicates, ${stats.missing} missing/invalid and ${stats.outliers} price outliers removed \u2192 ${stats.output.toLocaleString("en-IN")} clean records.` },
    { icon: Calculator, title: "3. Index calculation", body: `Jevons (unweighted geometric mean of price relatives) and Fisher (availability-weighted, Laspeyres \u00d7 Paasche) indices computed per route and rolled up nationally.` },
    { icon: LayoutDashboard, title: "4. Dashboard", body: `Trends, route/airline comparisons and historical series rendered live from the clean dataset \u2014 see Overview and Routes & Airlines tabs.` },
    { icon: Code2, title: "5. Policymaker API", body: `Processed indices exposed as JSON for integration with government statistical systems \u2014 see the API tab.` },
  ];

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
        {stages.map((s, i) => {
          const Icon = s.icon;
          return (
            <Card key={i} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <Icon size={18} color={marigold} />
              <div style={{ fontSize: 13, fontWeight: 700 }}>{s.title}</div>
              <div style={{ fontSize: 12, color: muted, lineHeight: 1.5 }}>{s.body}</div>
            </Card>
          );
        })}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <AlertTriangle size={16} color={rose} />
            <div style={{ fontSize: 13, fontWeight: 700 }}>Raw record (as collected)</div>
          </div>
          <pre style={{ fontSize: 12, background: panelAlt, padding: 12, borderRadius: 8, overflowX: "auto", color: "#C9D4E8" }}>
{JSON.stringify(sampleDirty, null, 2)}
          </pre>
          <div style={{ fontSize: 11.5, color: muted, marginTop: 8 }}>Flagged: invalid / missing fare value \u2192 dropped before indexing.</div>
        </Card>
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <CheckCircle2 size={16} color={teal} />
            <div style={{ fontSize: 13, fontWeight: 700 }}>Standardised record (post-cleaning)</div>
          </div>
          <pre style={{ fontSize: 12, background: panelAlt, padding: 12, borderRadius: 8, overflowX: "auto", color: "#C9D4E8" }}>
{JSON.stringify(sampleClean, null, 2)}
          </pre>
          <div style={{ fontSize: 11.5, color: muted, marginTop: 8 }}>Common schema: route, airline, window, fare, taxes, total, availability, timestamp.</div>
        </Card>
      </div>

      <Card>
        <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>Note on this prototype</div>
        <div style={{ fontSize: 12.5, color: muted, lineHeight: 1.6 }}>
          This environment cannot reach live airline or OTA websites, so Stage 1 uses a seeded simulator that generates
          realistic fare behaviour (advance-purchase curves, weekday seasonality, a demand shock, and injected duplicates/
          missing values/outliers) instead of real scraped data. Every later stage \u2014 cleaning, Jevons/Fisher index
          construction, the dashboard and the API \u2014 runs on that simulated dataset exactly as it would on real collected
          fares, so the pipeline mechanics are fully working end to end.
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
function ApiTab({ apiRoute, setApiRoute, sampleResponse, copied, setCopied }) {
  const endpoints = [
    { method: "GET", path: "/v1/index/national", desc: "Latest and historical national AIRX (Jevons & Fisher)." },
    { method: "GET", path: "/v1/index/route/{route}", desc: "Route-wise index series, e.g. DEL-BOM." },
    { method: "GET", path: "/v1/fares/route/{route}", desc: "Cleaned fare observations by airline and booking window." },
    { method: "GET", path: "/v1/meta/routes", desc: "List of tracked routes with index weights." },
  ];
  const copy = () => {
    navigator.clipboard?.writeText(JSON.stringify(sampleResponse, null, 2));
    setCopied(true); setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
      <Card>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Policymaker / statistical-system API</div>
        <div style={{ display: "grid", gap: 8 }}>
          {endpoints.map((e) => (
            <div key={e.path} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 10px", background: panelAlt, borderRadius: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: teal, background: "rgba(63,179,154,0.12)", padding: "2px 7px", borderRadius: 5, marginTop: 1 }}>{e.method}</span>
              <div>
                <div className="airx-mono" style={{ fontSize: 13, fontWeight: 600 }}>{e.path}</div>
                <div style={{ fontSize: 12, color: muted }}>{e.desc}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12, color: muted, marginBottom: 6 }}>Preview response for route</div>
          <select value={apiRoute} onChange={(e) => setApiRoute(e.target.value)}
            style={{ background: panelAlt, color: text, border: `1px solid ${line}`, borderRadius: 7, padding: "8px 10px", fontSize: 13, width: "100%" }}>
            {ROUTES.map(r => <option key={r.code} value={r.code}>{r.code} \u2014 {r.name}</option>)}
          </select>
        </div>
        <div style={{ fontSize: 11.5, color: muted, marginTop: 14, lineHeight: 1.6 }}>
          Intended integration: government statistical systems (e.g. MoSPI/CPI pipelines) would poll these endpoints on a
          scheduled basis and ingest the JSON payload directly into their own data warehouse, using <span className="airx-mono">as_of_day</span> and
          <span className="airx-mono"> generated_at</span> for freshness checks.
        </div>
      </Card>

      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>GET /v1/index/route/{apiRoute}</div>
          <button onClick={copy} style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", border: `1px solid ${line}`, color: muted, borderRadius: 6, padding: "5px 10px", fontSize: 12, cursor: "pointer" }}>
            <Copy size={13} /> {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <pre style={{ fontSize: 12.5, background: panelAlt, padding: 14, borderRadius: 8, overflowX: "auto", color: "#C9D4E8", lineHeight: 1.6 }}>
{JSON.stringify(sampleResponse, null, 2)}
        </pre>
      </Card>
    </div>
  );
}
