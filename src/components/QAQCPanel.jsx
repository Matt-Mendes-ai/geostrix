import React, { useMemo, useState } from "react";
import { X, Download } from "lucide-react";
import Papa from "papaparse";
import { saveFile } from "../lib/desktop.js";
import { classifyQAQCRow, excludedQAQCIds, standardGroups, standardSeries, blankRows, duplicatePairs, duplicateSummary, DEFAULT_QAQC_PATTERNS } from "../lib/qaqc.js";
import { useStore } from "../lib/store.jsx"; // TASKS.csv #400 — certified values live in the project
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";
import { overlay, backdropProps } from "../lib/modalStyles.js";
import { activateOnKey } from "../lib/a11y.js"; // TASKS.csv #238 — Enter/Space on clickable non-button elements

// TASKS.csv #134 — lab QAQC dashboard (standards/blanks/duplicates), distinct from dataQC.js's
// geometric QC. See qaqc.js's header comment for the identification approach (hole_id naming
// convention, no external CRM certificate database) and its accepted first-pass limitations.
const TABS = ["standards", "blanks", "duplicates"];
import { arrMin, arrMax } from "../lib/arrayStats.js"; // TASKS.csv #371 — no Math.min/max(...spread)

export default function QAQCPanel({ assays, assayElements, onClose }) {
  useEscapeKey(onClose); // TASKS.csv #238
  useFocusTrap(); // TASKS.csv #238
  const elementUnits = useMemo(() => Object.fromEntries(assayElements.map((e) => [e.symbol, e.unit])), [assayElements]);
  const [symbol, setSymbol] = useState(assayElements[0]?.symbol || "");
  const [tab, setTab] = useState("standards");
  const [blankThreshold, setBlankThreshold] = useState(0.1);
  const [selectedStdId, setSelectedStdId] = useState(null);
  const { crmCertificates = {}, setCrmCertificate } = useStore() || {}; // #400
  const [dupMin, setDupMin] = useState(""); // #400 — ignore pairs whose mean is below this (~10x detection limit)

  const counts = useMemo(() => {
    const c = { standard: 0, blank: 0, duplicate: 0, regular: 0 };
    assays.forEach((a) => { c[classifyQAQCRow(a)]++; }); // #400: the row (sample_type), not just the name
    return c;
  }, [assays]);

  const groups = useMemo(() => standardGroups(assays), [assays]);
  const excludedIds = useMemo(() => excludedQAQCIds(assays), [assays]); // TASKS.csv #400
  const activeGroup = groups.find((g) => g.id === selectedStdId) || groups[0] || null;
  const cert = activeGroup ? crmCertificates[activeGroup.id]?.[symbol] : null;
  const series = useMemo(() => (activeGroup ? standardSeries(activeGroup.rows, symbol, elementUnits, cert) : { points: [], limits: null }), [activeGroup, symbol, elementUnits, cert]);

  const blanks = useMemo(() => blankRows(assays, symbol, elementUnits, blankThreshold), [assays, symbol, elementUnits, blankThreshold]);
  const dups = useMemo(() => duplicatePairs(assays, symbol, elementUnits, undefined, { minMean: Number(dupMin) || 0 }), [assays, symbol, elementUnits, dupMin]);
  const dupSummary = useMemo(() => duplicateSummary(dups, 20), [dups]);

  const exportCSV = () => {
    let rows, name;
    if (tab === "standards" && activeGroup) {
      rows = series.points.map((p) => ({ standard: activeGroup.id, hole_id: p.hole_id, from: p.from, to: p.to, [symbol]: p.value, outside_2sd: p.outside2sd, outside_3sd: p.outside3sd }));
      name = `qaqc_standard_${activeGroup.id}_${symbol}.csv`;
    } else if (tab === "blanks") {
      rows = blanks.map((b) => ({ hole_id: b.hole_id, from: b.from, to: b.to, [symbol]: b.value, threshold: blankThreshold, flagged: b.flagged }));
      name = `qaqc_blanks_${symbol}.csv`;
    } else {
      rows = dups.map((d) => ({ original_hole: d.original_hole, duplicate_hole: d.duplicate_hole, from: d.from, to: d.to, original_value: d.v1, duplicate_value: d.v2, rpd_pct: d.rpd.toFixed(2) }));
      name = `qaqc_duplicates_${symbol}.csv`;
    }
    if (!rows || !rows.length) return;
    saveFile({ suggestedName: name, filters: [{ name: "CSV", extensions: ["csv"] }], content: Papa.unparse(rows) });
  };

  return (
    <div style={overlay} {...backdropProps(onClose)}>
      <div style={panel} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div style={header}>
          <div>
            <div style={{ fontSize: "var(--font-size-lg)", color: "var(--color-accent-dark)", fontWeight: 600 }}>QAQC — lab quality control</div>
            <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", marginTop: 2 }}>
              Detected (a sample-type column if the assays have one, else the ID; never a hole that is in the collars): {counts.standard} standard{counts.standard === 1 ? "" : "s"}, {counts.blank} blank{counts.blank === 1 ? "" : "s"}, {counts.duplicate} duplicate{counts.duplicate === 1 ? "" : "s"} (of {assays.length} total intervals).
              {/* TASKS.csv #400 — exactly which ids are left out of the reports, and why */}
              {(counts.standard + counts.blank + counts.duplicate) > 0 && (
                <details style={{ marginTop: 4 }}>
                  <summary style={{ cursor: "pointer" }}>Excluded from intercepts, compositing, estimation and statistics — list the ids</summary>
                  {["standard", "blank", "duplicate"].map((c) => excludedIds[c].length > 0 && (
                    <div key={c} style={{ marginTop: 3 }}><b>{c}s:</b> {excludedIds[c].map((e) => `${e.id} (${e.rows}${e.why === "name" ? ", by name" : ""})`).join(", ")}</div>
                  ))}
                  <div style={{ marginTop: 3 }}>If a real hole is listed "by name", import its collar: holes in the collar table are never treated as QC.</div>
                </details>
              )}
            </div>
          </div>
          <X role="button" tabIndex={0} onKeyDown={activateOnKey} aria-label="Close" size={18} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} onClick={onClose} />
        </div>

        <div style={{ padding: 16, overflow: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
            <label style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>Element
              <select value={symbol} onChange={(e) => setSymbol(e.target.value)} style={{ ...sel, display: "block", marginTop: 4 }}>
                {assayElements.map((e) => <option key={e.symbol} value={e.symbol}>{e.symbol}</option>)}
              </select>
            </label>
            <div style={{ display: "flex", gap: 4 }}>
              {TABS.map((t) => (
                <button key={t} onClick={() => setTab(t)} style={t === tab ? tabBtnActive : tabBtn}>
                  {t === "standards" ? `Standards (${groups.length})` : t === "blanks" ? `Blanks (${counts.blank})` : `Duplicates (${dups.length})`}
                </button>
              ))}
            </div>
          </div>

          {tab === "standards" && (
            groups.length === 0 ? (
              <div style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", padding: 8 }}>No repeated standard insertions found. Standards are detected by hole_id containing "std", "crm", "oreas", etc. — a standard inserted only once has nothing to compare it against.</div>
            ) : (
              <>
                <label style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>Standard
                  <select value={activeGroup?.id || ""} onChange={(e) => setSelectedStdId(e.target.value)} style={{ ...sel, display: "block", marginTop: 4 }}>
                    {groups.map((g) => <option key={g.id} value={g.id}>{g.id} ({g.rows.length})</option>)}
                  </select>
                </label>
                {!series.limits ? (
                  <div style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", padding: 8 }}>No {symbol} values found for this standard.</div>
                ) : (
                  <>
                    <div style={label}>
                      Control chart — {symbol} ({elementUnits[symbol] || "ppm"}), {series.limits.certified ? "CERTIFIED mean ± 2SD/3SD (from the certificate)" : "self-referencing mean ± 2SD/3SD (enter the certificate values below for certified limits)"}
                    </div>
                    {/* TASKS.csv #400 — certificate values, saved with the project */}
                    <CertInputs key={`${activeGroup.id}|${symbol}`} cert={cert} unit={elementUnits[symbol] || "ppm"} onSave={(c) => setCrmCertificate?.(activeGroup.id, symbol, c)} />
                    <ControlChart points={series.points} limits={series.limits} />
                    <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>
                      {series.limits.certified
                        ? <>Certified {series.limits.mean} ± {series.limits.sd} · observed mean {series.observed.mean.toFixed(3)} (SD {series.observed.sd.toFixed(3)}, n={series.observed.n}) · <b style={{ color: Math.abs(series.biasPct) > 5 ? "var(--color-danger-fg)" : "inherit" }}>bias {series.biasPct >= 0 ? "+" : ""}{series.biasPct.toFixed(1)}%</b>{Math.abs(series.biasPct) > 5 ? " (over ±5%)" : ""}</>
                        : <>Mean {series.limits.mean.toFixed(3)} · SD {series.limits.sd.toFixed(3)} · n={series.limits.n}</>}
                      {series.points.some((p) => p.outside2sd) && <span style={{ color: "var(--color-danger-alt)", marginLeft: 8 }}>{series.points.filter((p) => p.outside2sd).length} point(s) outside 2SD</span>}
                    </div>
                  </>
                )}
              </>
            )
          )}

          {tab === "blanks" && (
            <>
              <label style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>Contamination threshold ({elementUnits[symbol] || "ppm"})
                <input type="number" step="0.01" value={blankThreshold} onChange={(e) => setBlankThreshold(Number(e.target.value))} style={{ ...sel, display: "block", marginTop: 4, width: 100 }} />
              </label>
              {blanks.length === 0 ? (
                <div style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", padding: 8 }}>No blanks found (hole_id containing "blank"/"blk"), or none have a {symbol} value.</div>
              ) : (
                <table style={{ borderCollapse: "collapse", fontSize: "var(--font-size-sm)", width: "100%" }}>
                  <thead><tr><th style={th}>Hole ID</th><th style={th}>From</th><th style={th}>To</th><th style={th}>{symbol}</th><th style={th}>Flag</th></tr></thead>
                  <tbody>
                    {blanks.map((b, i) => (
                      <tr key={i} style={b.flagged ? { background: "var(--color-danger-bg)" } : undefined}>
                        <td style={td}>{b.hole_id}</td><td style={td}>{b.from}</td><td style={td}>{b.to}</td>
                        <td style={{ ...td, color: b.flagged ? "var(--color-danger-fg)" : "var(--color-text)" }}>{b.value.toFixed(4)}</td>
                        <td style={td}>{b.flagged ? "⚠ contaminated" : "ok"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}

          {tab === "duplicates" && (
            dups.length === 0 ? (
              <div style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", padding: 8 }}>No duplicate pairs found — a duplicate row (hole_id containing "dup") needs a matching original row at the exact same hole_id/from/to (see info).</div>
            ) : (
              <>
                <div style={label}>Relative % difference (RPD) — {symbol}, {dups.length} pair{dups.length === 1 ? "" : "s"}</div>
                <label style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }} title="RPD near the detection limit is meaningless: set this to about 10 x the detection limit. Pairs below it are greyed and not counted.">Ignore pairs with a mean below ({elementUnits[symbol] || "ppm"}, e.g. 10× detection limit)
                  <input type="number" min={0} step="any" value={dupMin} onChange={(e) => setDupMin(e.target.value)} style={{ ...sel, display: "block", marginTop: 4, width: 100 }} aria-label="Minimum pair mean" />
                </label>
                <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text)" }}>
                  {dupSummary.used ? `${dupSummary.within} of ${dupSummary.used} counted pairs (${dupSummary.pctWithin.toFixed(0)}%) within 20% RPD` : "No pairs above the limit"}{dupSummary.below ? ` · ${dupSummary.below} below the limit, not counted` : ""}.
                </div>
                <table style={{ borderCollapse: "collapse", fontSize: "var(--font-size-sm)", width: "100%" }}>
                  <thead><tr><th style={th}>Original</th><th style={th}>Duplicate</th><th style={th}>Interval</th><th style={th}>V1</th><th style={th}>V2</th><th style={th}>RPD %</th></tr></thead>
                  <tbody>
                    {dups.map((d, i) => (
                      <tr key={i} style={d.belowLimit ? { opacity: 0.45 } : d.rpd > 20 ? { background: "var(--color-danger-bg)" } : undefined} title={`paired by ${d.how}${d.belowLimit ? "; below the limit, not counted" : ""}`}>
                        <td style={td}>{d.original_hole}</td><td style={td}>{d.duplicate_hole}</td>
                        <td style={td}>{d.from}–{d.to}</td>
                        <td style={td}>{d.v1.toFixed(4)}</td><td style={td}>{d.v2.toFixed(4)}</td>
                        <td style={{ ...td, color: d.rpd > 20 ? "var(--color-danger-fg)" : "var(--color-text)" }}>{d.rpd.toFixed(1)}{d.rpd > 20 ? " ⚠" : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>Flagged at RPD &gt; 20%, a common industry rule-of-thumb precision threshold — not a certified/regulatory limit.</div>
              </>
            )
          )}

          <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.5, borderTop: "1px solid var(--color-border)", paddingTop: 8 }}>
            QC samples are recognised from a sample-type column when the assay file has one (standards grouped by a CRM / standard-name column if present), otherwise from the hole_id (standards "std"/"crm"/"oreas"…, blanks "blank"/"blk", duplicates "dup"); a hole in the collar table is never QC. Duplicates pair by parent sample id, else the same hole and interval, else the name. Certified limits come from the values you enter from each CRM's certificate.
          </div>

          <button onClick={exportCSV} style={{ ...btn(true), alignSelf: "flex-start", padding: "7px 14px", display: "flex", alignItems: "center", gap: 6 }}>
            <Download size={14} /> Export current view (CSV)
          </button>
        </div>

        <div style={{ display: "flex", gap: 8, padding: "12px 16px", borderTop: "1px solid var(--color-border)" }}>
          <button onClick={onClose} style={{ ...btn(false), flex: 1 }}>Close</button>
        </div>
      </div>
    </div>
  );
}

// TASKS.csv #400 — the certificate's mean and 1 SD for this standard + element
function CertInputs({ cert, unit, onSave }) {
  const [mean, setMean] = useState(cert?.mean ?? "");
  const [sd, setSd] = useState(cert?.sd ?? "");
  const ok = mean !== "" && Number.isFinite(Number(mean)) && Number(sd) > 0;
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 8, flexWrap: "wrap", fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>
      <label>Certified mean ({unit})<input type="number" step="any" value={mean} onChange={(e) => setMean(e.target.value)} style={{ ...sel, display: "block", marginTop: 4, width: 100 }} aria-label="Certified mean" /></label>
      <label>Certified 1 SD<input type="number" step="any" min={0} value={sd} onChange={(e) => setSd(e.target.value)} style={{ ...sel, display: "block", marginTop: 4, width: 100 }} aria-label="Certified standard deviation" /></label>
      <button type="button" disabled={!ok} onClick={() => onSave({ mean: Number(mean), sd: Number(sd) })} style={{ ...tabBtn, opacity: ok ? 1 : 0.5 }}>Use certificate</button>
      {cert && <button type="button" onClick={() => { setMean(""); setSd(""); onSave(null); }} style={tabBtn}>Clear</button>}
    </div>
  );
}

function ControlChart({ points, limits }) {
  const w = 640, h = 200, padL = 50, padR = 10, padT = 14, padB = 24;
  const plotW = w - padL - padR, plotH = h - padT - padB;
  const vMin = Math.min(limits.lcl3, arrMin(points.map((p) => p.value)));
  const vMax = Math.max(limits.ucl3, arrMax(points.map((p) => p.value)));
  const range = (vMax - vMin) || 1;
  const y = (v) => padT + plotH - ((v - vMin) / range) * plotH;
  const x = (i) => points.length > 1 ? padL + (i / (points.length - 1)) * plotW : padL + plotW / 2;
  const band = (lo, hi, fill) => <rect x={padL} y={y(hi)} width={plotW} height={Math.max(0, y(lo) - y(hi))} fill={fill} />;
  return (
    <svg width={w} height={h} style={{ maxWidth: "100%" }}>
      {band(limits.lcl3, limits.ucl3, "rgba(217,83,79,0.08)")}
      {band(limits.lcl2, limits.ucl2, "rgba(226,166,60,0.12)")}
      <line x1={padL} y1={y(limits.mean)} x2={w - padR} y2={y(limits.mean)} stroke="#1e5a9c" strokeWidth="1.5" />
      <line x1={padL} y1={y(limits.ucl2)} x2={w - padR} y2={y(limits.ucl2)} stroke="#e2a63c" strokeWidth="1" strokeDasharray="4,3" />
      <line x1={padL} y1={y(limits.lcl2)} x2={w - padR} y2={y(limits.lcl2)} stroke="#e2a63c" strokeWidth="1" strokeDasharray="4,3" />
      <line x1={padL} y1={y(limits.ucl3)} x2={w - padR} y2={y(limits.ucl3)} stroke="#d9534f" strokeWidth="1" strokeDasharray="2,3" />
      <line x1={padL} y1={y(limits.lcl3)} x2={w - padR} y2={y(limits.lcl3)} stroke="#d9534f" strokeWidth="1" strokeDasharray="2,3" />
      {points.length > 1 && (
        <polyline fill="none" stroke="#55606e" strokeWidth="1" points={points.map((p) => `${x(p.i)},${y(p.value)}`).join(" ")} />
      )}
      {points.map((p) => (
        <circle key={p.i} cx={x(p.i)} cy={y(p.value)} r={4} fill={p.outside3sd ? "#d9534f" : p.outside2sd ? "#e2a63c" : "#4a9be0"} stroke="#ffffff" strokeWidth="1" />
      ))}
      <text x={padL - 6} y={y(limits.mean) + 4} fontSize="9.5" fill="#1e5a9c" textAnchor="end">mean</text>
    </svg>
  );
}

const panel = { width: "min(820px, 95vw)", maxHeight: "88vh", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 10, display: "flex", flexDirection: "column", overflow: "hidden" };
const header = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid var(--color-border)" };
const label = { fontSize: "var(--font-size-sm)", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: 8 };
const sel = { background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 6, padding: "6px 8px", color: "var(--color-text)", fontSize: "var(--font-size-base)", fontFamily: "inherit" };
const btn = (primary) => ({ padding: "8px 0", borderRadius: 6, fontSize: "var(--font-size-base)", cursor: "pointer", border: primary ? "1px solid var(--color-success-border)" : "1px solid var(--color-border-light)", background: primary ? "var(--color-success-bg)" : "transparent", color: primary ? "var(--color-success-text)" : "var(--color-text-secondary)" });
const tabBtn = { padding: "6px 10px", borderRadius: 6, fontSize: "var(--font-size-base)", cursor: "pointer", border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text-secondary)" };
const tabBtnActive = { ...tabBtn, background: "var(--color-text)", color: "var(--color-bg)", border: "1px solid var(--color-text)" };
const th = { padding: "4px 8px", color: "var(--color-text-secondary)", fontWeight: 500, textAlign: "right", borderBottom: "1px solid var(--color-border)" };
const td = { padding: "4px 8px", color: "var(--color-text)", textAlign: "right", fontFamily: "'Exo 2', system-ui, sans-serif" };
