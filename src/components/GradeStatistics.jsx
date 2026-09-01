import React, { useMemo, useState } from "react";
import { X, Download } from "lucide-react";
import Papa from "papaparse";
import { valueIn } from "../lib/geochem.js";
import { excludeQAQC } from "../lib/qaqc.js";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";
import { LAYER_META, UNIT_NAMES } from "../lib/layers.js";
import { saveFile } from "../lib/desktop.js";
import { overlay } from "../lib/modalStyles.js";

// TASKS.csv #136 — univariate grade statistics per domain: a prerequisite step before any estimation
// work or capping decision (per the Micromine-specialist audit this was logged from), adjacent to but
// distinct from the multi-element Correlation Matrix (#21) — this is ONE element's own distribution,
// broken out by domain, not element-vs-element relationships.

const DOMAIN_LAYER_KEYS = ["litho", "alt", "vein", "geotech", "magsusc", "structure"];

// Sample statistics (n-1 denominator for variance/stdev, the standard convention for a sample rather
// than a full population — grade data is always a sample of the deposit, never the whole thing).
function computeStats(values) {
  const n = values.length;
  if (!n) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const variance = n > 1 ? values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1) : 0;
  const stdev = Math.sqrt(variance);
  const cv = mean !== 0 ? (stdev / mean) * 100 : null;
  const quantile = (p) => {
    const idx = p * (sorted.length - 1);
    const lo = Math.floor(idx), hi = Math.ceil(idx);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  };
  const median = quantile(0.5);
  return { n, mean, median, stdev, variance, cv, min: sorted[0], max: sorted[sorted.length - 1], q1: quantile(0.25), q3: quantile(0.75), sorted };
}

// Domain lookup, same overlap-by-midpoint approach compositeAssays (geochem.js) already uses for
// composite building — kept as its own small local copy here since this only needs a single value
// per interval, not full domain-boundary-aware compositing.
function domainForInterval(domainRows, hole_id, from, to) {
  const rows = domainRows.filter((r) => r.hole_id === hole_id);
  if (!rows.length) return null;
  const mid = (from + to) / 2;
  const hit = rows.find((r) => mid >= r.from && mid < r.to);
  return hit ? hit.value : null;
}

function niceBinCount(n) {
  // Sturges' rule, clamped to a sane range for a small UI histogram.
  return Math.max(6, Math.min(24, Math.round(Math.log2(n) + 1)));
}

export default function GradeStatistics({ assays, assayElements, layers, surfaceSamples = [], surfaceElements = [], onClose }) {
  useEscapeKey(onClose); // TASKS.csv #238
  useFocusTrap(); // TASKS.csv #238
  const elementUnits = useMemo(() => Object.fromEntries(assayElements.map((e) => [e.symbol, e.unit])), [assayElements]);
  // TASKS.csv #228 — surface geochemistry has no downhole domain (litho/alt/etc are interval layers
  // tied to hole_id/from/to, which surface samples don't have) but DOES have its own natural grouping
  // dimension, sampling medium (soil/rock chip/stream sediment/...), so "source" picks which dataset
  // this whole panel reports on rather than trying to merge two differently-shaped datasets into one
  // set of domain options. valueIn() itself is already source-agnostic (just reads `sample.values`),
  // so only the domain-grouping and QAQC-exclusion logic below actually branches on source.
  const [source, setSource] = useState("assays"); // "assays" | "surface"
  const surfaceElementUnits = useMemo(() => Object.fromEntries(surfaceElements.map((e) => [e.symbol, e.unit])), [surfaceElements]);
  const activeElements = source === "surface" ? surfaceElements : assayElements;
  const [symbol, setSymbol] = useState(assayElements[0]?.symbol || "");
  const [domainKey, setDomainKey] = useState("");
  const [logScale, setLogScale] = useState(false);
  // TASKS.csv #219 — QC samples (standards/blanks/duplicates) default OUT of grade statistics, same
  // as Best Intercepts/Compositing — a standard's own repeat-insertion grade shouldn't skew a domain's
  // mean/stdev/CV.
  const [includeQAQC, setIncludeQAQC] = useState(false);
  const qaqcExcludedCount = useMemo(() => assays.length - excludeQAQC(assays).length, [assays]);
  const statsAssays = useMemo(() => (includeQAQC ? assays : excludeQAQC(assays)), [assays, includeQAQC]);

  const domainOptions = source === "assays" ? DOMAIN_LAYER_KEYS.filter((k) => (layers[k] || []).length > 0) : [];
  const domainRows = domainKey ? layers[domainKey] : null;
  const domainLabel = (v) => (domainKey === "litho" ? (UNIT_NAMES[v] || v) : v);

  // Per-sample {value, domain} pairs — every row that has a real numeric value for the selected
  // element (log scale needs strictly positive values; a handful of at/below-zero rows, e.g. a
  // below-detection row already halved by parseAssayValue's "<" handling, are excluded from the log
  // view specifically rather than silently breaking the whole chart). Surface samples group by their
  // own sampling medium instead of a downhole domain layer — see `source`'s own comment above.
  const rows = useMemo(() => {
    if (source === "surface") {
      return surfaceSamples.map((s) => {
        const v = valueIn(s, symbol, surfaceElementUnits[symbol] || "ppm", surfaceElementUnits);
        if (v == null) return null;
        return { value: v, domain: s.medium || "(unclassified)" };
      }).filter(Boolean);
    }
    return statsAssays.map((a) => {
      const v = valueIn(a, symbol, elementUnits[symbol] || "ppm", elementUnits);
      if (v == null) return null;
      const domain = domainRows ? domainForInterval(domainRows, a.hole_id, a.from, a.to) : "All";
      return { value: v, domain };
    }).filter(Boolean);
  }, [source, surfaceSamples, statsAssays, symbol, elementUnits, surfaceElementUnits, domainRows]);

  const groups = useMemo(() => {
    const byDomain = new Map();
    rows.forEach((r) => {
      const key = r.domain == null ? "(unclassified)" : r.domain;
      if (!byDomain.has(key)) byDomain.set(key, []);
      byDomain.get(key).push(r.value);
    });
    return Array.from(byDomain.entries())
      .map(([key, values]) => ({ key, stats: computeStats(values) }))
      .sort((a, b) => b.stats.n - a.stats.n);
  }, [rows]);

  const allValues = rows.map((r) => r.value);
  const overallStats = useMemo(() => computeStats(allValues), [allValues]);

  const histogram = useMemo(() => {
    if (!overallStats) return null;
    const vals = logScale ? allValues.filter((v) => v > 0).map((v) => Math.log10(v)) : allValues;
    if (!vals.length) return null;
    const min = Math.min(...vals), max = Math.max(...vals);
    const binCount = niceBinCount(vals.length);
    const width = (max - min) || 1;
    const binW = width / binCount;
    const bins = new Array(binCount).fill(0);
    vals.forEach((v) => {
      let i = Math.floor((v - min) / binW);
      if (i >= binCount) i = binCount - 1;
      if (i < 0) i = 0;
      bins[i]++;
    });
    return { bins, min, max, binW, maxCount: Math.max(...bins) };
  }, [allValues, logScale, overallStats]);

  const exportCSV = () => {
    const rowsOut = groups.map((g) => ({
      domain: domainKey === "litho" ? domainLabel(g.key) : g.key,
      n: g.stats.n, mean: g.stats.mean.toFixed(4), median: g.stats.median.toFixed(4),
      stdev: g.stats.stdev.toFixed(4), cv_pct: g.stats.cv == null ? "" : g.stats.cv.toFixed(1),
      min: g.stats.min.toFixed(4), max: g.stats.max.toFixed(4), q1: g.stats.q1.toFixed(4), q3: g.stats.q3.toFixed(4),
    }));
    saveFile({ suggestedName: `${symbol}_grade_statistics.csv`, filters: [{ name: "CSV", extensions: ["csv"] }], content: Papa.unparse(rowsOut) });
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div style={header}>
          <div>
            <div style={{ fontSize: 15, color: "#8a6a1f", fontWeight: 600 }}>Grade statistics</div>
            <div style={{ fontSize: 11, color: "#94a1b0", marginTop: 2 }}>
              Univariate distribution per domain — {source === "surface" ? `${surfaceSamples.length} surface samples loaded.` : `${assays.length} intervals loaded.`}
              {source === "assays" && qaqcExcludedCount > 0 && !includeQAQC ? ` ${qaqcExcludedCount} QC sample(s) (standards/blanks/duplicates) excluded.` : ""}
            </div>
          </div>
          <X size={18} style={{ cursor: "pointer", color: "#55606e" }} onClick={onClose} />
        </div>

        <div style={{ padding: 16, overflow: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
          {surfaceSamples.length > 0 && (
            <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
              <label style={{ fontSize: 11, color: "#55606e" }}>Data source
                <select
                  value={source}
                  onChange={(e) => {
                    const next = e.target.value;
                    setSource(next);
                    const els = next === "surface" ? surfaceElements : assayElements;
                    setSymbol(els[0]?.symbol || "");
                    setDomainKey("");
                  }}
                  style={{ ...sel, display: "block", marginTop: 4 }}
                >
                  <option value="assays">Drillhole assays</option>
                  <option value="surface">Surface samples</option>
                </select>
              </label>
            </div>
          )}
          {source === "assays" && qaqcExcludedCount > 0 && (
            <label style={{ fontSize: 11, color: "#55606e", display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }} title="QC samples (standards/blanks/duplicates, detected by hole_id naming) are excluded by default so a standard's own repeat-insertion grade can't skew a domain's mean/stdev/CV — check this to include them anyway.">
              <input type="checkbox" checked={includeQAQC} onChange={(e) => setIncludeQAQC(e.target.checked)} />
              Include QC samples (standards/blanks/duplicates) in this report
            </label>
          )}
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
            <label style={{ fontSize: 11, color: "#55606e" }}>Element
              <select value={symbol} onChange={(e) => setSymbol(e.target.value)} style={{ ...sel, display: "block", marginTop: 4 }}>
                {activeElements.map((e) => <option key={e.symbol} value={e.symbol}>{e.symbol}</option>)}
              </select>
            </label>
            {source === "assays" ? (
              <label style={{ fontSize: 11, color: "#55606e" }}>Domain (optional)
                <select value={domainKey} onChange={(e) => setDomainKey(e.target.value)} style={{ ...sel, display: "block", marginTop: 4 }}>
                  <option value="">— none, all intervals together —</option>
                  {domainOptions.map((k) => <option key={k} value={k}>{LAYER_META[k].label}</option>)}
                </select>
              </label>
            ) : (
              <div style={{ fontSize: 10.5, color: "#94a1b0", marginBottom: 6 }}>Grouped by sampling medium</div>
            )}
            <label style={{ fontSize: 11, color: "#55606e", display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <input type="checkbox" checked={logScale} onChange={(e) => setLogScale(e.target.checked)} /> Log-scale histogram
            </label>
          </div>

          {!overallStats ? (
            <div style={{ fontSize: 12, color: "#55606e", padding: 8 }}>No {symbol} values found in the loaded {source === "surface" ? "surface sample" : "assay"} data.</div>
          ) : (
            <>
              <div>
                <div style={label}>Distribution — {symbol} ({elementUnits[symbol] || "ppm"}){logScale ? ", log₁₀ scale" : ""}</div>
                <Histogram data={histogram} unit={elementUnits[symbol] || "ppm"} logScale={logScale} />
              </div>

              <div>
                <div style={label}>By domain — {groups.length} group{groups.length === 1 ? "" : "s"}</div>
                <BoxPlots groups={groups} domainLabel={domainKey === "litho" ? domainLabel : (v) => v} />
              </div>

              <div style={{ overflowX: "auto" }}>
                <table style={{ borderCollapse: "collapse", fontSize: 11, width: "100%" }}>
                  <thead>
                    <tr>
                      <th style={th}>Domain</th><th style={th}>n</th><th style={th}>Mean</th><th style={th}>Median</th>
                      <th style={th}>Stdev</th><th style={th}>CV%</th><th style={th}>Min</th><th style={th}>Q1</th><th style={th}>Q3</th><th style={th}>Max</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map((g) => (
                      <tr key={g.key}>
                        <td style={td}>{domainKey === "litho" ? domainLabel(g.key) : g.key}</td>
                        <td style={td}>{g.stats.n}</td>
                        <td style={td}>{g.stats.mean.toFixed(3)}</td>
                        <td style={td}>{g.stats.median.toFixed(3)}</td>
                        <td style={td}>{g.stats.stdev.toFixed(3)}</td>
                        <td style={td}>{g.stats.cv == null ? "—" : g.stats.cv.toFixed(0)}</td>
                        <td style={td}>{g.stats.min.toFixed(3)}</td>
                        <td style={td}>{g.stats.q1.toFixed(3)}</td>
                        <td style={td}>{g.stats.q3.toFixed(3)}</td>
                        <td style={td}>{g.stats.max.toFixed(3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button onClick={exportCSV} style={{ ...btn(true), alignSelf: "flex-start", padding: "7px 14px", display: "flex", alignItems: "center", gap: 6 }}>
                <Download size={13} /> Export statistics (CSV)
              </button>
            </>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, padding: "12px 16px", borderTop: "1px solid #d9dce1" }}>
          <button onClick={onClose} style={{ ...btn(false), flex: 1 }}>Close</button>
        </div>
      </div>
    </div>
  );
}

function Histogram({ data, unit, logScale }) {
  if (!data) return <div style={{ fontSize: 12, color: "#55606e", padding: 8 }}>No values to plot.</div>;
  const w = 640, h = 160, padL = 40, padB = 20;
  const plotW = w - padL - 10, plotH = h - padB - 10;
  const barW = plotW / data.bins.length;
  return (
    <svg width={w} height={h} style={{ maxWidth: "100%" }}>
      {data.bins.map((count, i) => {
        const barH = data.maxCount ? (count / data.maxCount) * plotH : 0;
        return (
          <rect key={i} x={padL + i * barW} y={10 + plotH - barH} width={Math.max(0, barW - 1)} height={barH} fill="#4a9be0" />
        );
      })}
      <line x1={padL} y1={10 + plotH} x2={padL + plotW} y2={10 + plotH} stroke="#c7ccd3" />
      <text x={padL} y={h - 4} fontSize="9.5" fill="#55606e">{(logScale ? Math.pow(10, data.min) : data.min).toFixed(logScale ? 3 : 2)}</text>
      <text x={padL + plotW} y={h - 4} fontSize="9.5" fill="#55606e" textAnchor="end">{(logScale ? Math.pow(10, data.max) : data.max).toFixed(logScale ? 3 : 2)} {unit}</text>
      <text x={4} y={16} fontSize="9.5" fill="#55606e">{data.maxCount}</text>
    </svg>
  );
}

// Simple box-and-whisker per domain group: whiskers to actual min/max (not a Tukey 1.5*IQR fence with
// separate outlier points — a lighter first pass; worth revisiting if capping/outlier work needs the
// distinction later).
function BoxPlots({ groups, domainLabel }) {
  if (!groups.length) return null;
  const w = 640, rowH = 34, padL = 90, padR = 20;
  const h = groups.length * rowH + 20;
  const globalMin = Math.min(...groups.map((g) => g.stats.min));
  const globalMax = Math.max(...groups.map((g) => g.stats.max));
  const range = (globalMax - globalMin) || 1;
  const x = (v) => padL + ((v - globalMin) / range) * (w - padL - padR);
  return (
    <svg width={w} height={h} style={{ maxWidth: "100%" }}>
      {groups.map((g, i) => {
        const y = 10 + i * rowH + rowH / 2;
        const s = g.stats;
        return (
          <g key={g.key}>
            <text x={padL - 8} y={y + 4} fontSize="10.5" fill="#1a2028" textAnchor="end">{domainLabel(g.key)}</text>
            <line x1={x(s.min)} y1={y} x2={x(s.max)} y2={y} stroke="#55606e" strokeWidth="1" />
            <line x1={x(s.min)} y1={y - 5} x2={x(s.min)} y2={y + 5} stroke="#55606e" strokeWidth="1" />
            <line x1={x(s.max)} y1={y - 5} x2={x(s.max)} y2={y + 5} stroke="#55606e" strokeWidth="1" />
            <rect x={x(s.q1)} y={y - 8} width={Math.max(1, x(s.q3) - x(s.q1))} height={16} fill="#4a9be0" fillOpacity="0.35" stroke="#4a9be0" />
            <line x1={x(s.median)} y1={y - 8} x2={x(s.median)} y2={y + 8} stroke="#1e5a9c" strokeWidth="2" />
          </g>
        );
      })}
    </svg>
  );
}

const panel = { width: "min(820px, 95vw)", maxHeight: "88vh", background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 10, display: "flex", flexDirection: "column", overflow: "hidden" };
const header = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid #d9dce1" };
const label = { fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "#94a1b0", marginBottom: 8 };
const sel = { background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 6, padding: "6px 8px", color: "#1a2028", fontSize: 12, fontFamily: "inherit" };
const btn = (primary) => ({ padding: "8px 0", borderRadius: 6, fontSize: 12, cursor: "pointer", border: primary ? "1px solid #3d6b52" : "1px solid #c7ccd3", background: primary ? "#1e3629" : "transparent", color: primary ? "#8fd9ab" : "#55606e" });
const th = { padding: "4px 8px", color: "#55606e", fontWeight: 500, textAlign: "right", borderBottom: "1px solid #d9dce1" };
const td = { padding: "4px 8px", color: "#1a2028", textAlign: "right", fontFamily: "'Exo 2', system-ui, sans-serif" };
