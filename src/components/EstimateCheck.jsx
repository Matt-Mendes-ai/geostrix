// TASKS.csv #1051 (review #1016, resource geologist / QP) — "Check this estimate": the composite mean, the nearest-
// neighbour (declustered) mean and the estimate's mean over the same blocks, and a swath plot along easting, northing
// or elevation, with which way and by how much the estimate departs from NN. The sums are lib/estimateCheck.js.
import React, { useMemo, useState } from "react";
import { Download } from "./icons.js";
import { t as tr } from "../lib/i18n.js";
import { saveFile } from "../lib/desktop.js";
import { toExportCsv } from "../lib/tabular.js";
import { stampLines, withStamp } from "../lib/provenance.js";
import { estimateCheck, swath, swathRows } from "../lib/estimateCheck.js";
import { version as APP_VERSION } from "../../package.json";

const sig = (v) => (v == null || !Number.isFinite(v) ? "—" : Number(v.toPrecision(3)).toLocaleString());
const AXES = [["x", "Easting"], ["y", "Northing"], ["z", "Elevation"]];

export default function EstimateCheck({ cells, nnCells, points, unit, symbol, method, epsg = null }) {
  const [axis, setAxis] = useState("x");
  const chk = useMemo(() => estimateCheck(cells, nnCells, points), [cells, nnCells, points]);
  const bins = useMemo(() => swath(cells, nnCells, points, axis), [cells, nnCells, points, axis]);
  if (!chk.estimate.n) return null;
  const d = chk.departPct, far = d != null && Math.abs(d) >= 10;

  // the swath plot: three series against the slice centre
  const W = 520, H = 190, L = 46, R = 12, T = 10, B = 30;
  const vals = bins.flatMap((b) => [b.composite, b.nn, b.estimate]).filter(Number.isFinite);
  const y1 = Math.max(...vals, 1e-9), x0 = bins.length ? bins[0].from : 0, x1 = bins.length ? bins[bins.length - 1].to : 1;
  const sx = (v) => L + ((v - x0) / (x1 - x0 || 1)) * (W - L - R), sy = (v) => T + (1 - v / y1) * (H - T - B);
  const line = (k) => { // breaks where a slice has no value
    const segs = []; let cur = [];
    for (const b of bins) { if (Number.isFinite(b[k])) cur.push(`${sx(b.mid).toFixed(1)},${sy(b[k]).toFixed(1)}`); else if (cur.length) { segs.push(cur); cur = []; } }
    if (cur.length) segs.push(cur);
    return segs;
  };
  const SERIES = [["composite", "#55606e", "", tr("composites (length-weighted)")], ["nn", "#2f6fe0", "5 3", tr("nearest neighbour")], ["estimate", "#c0392b", "", tr("estimate ({method})", { method })]];

  const exportCsv = () => {
    const rows = swathRows(bins, { axis, symbol }); // #1017 — rows in lib, tested
    const stamp = stampLines({ tool: "Estimate check (swath)", version: APP_VERSION, epsg, params: [
      `Element: ${symbol} (${unit}) | method ${method} | swath along ${axis === "x" ? "easting" : axis === "y" ? "northing" : "elevation"}`,
      `Over ${chk.estimate.n} blocks filled by both the estimate and the nearest-neighbour model (same grid and search)`,
      `Means: composites ${sig(chk.composites.mean)} (length-weighted, ${chk.composites.n} composites) | nearest neighbour ${sig(chk.nn.mean)} | estimate ${sig(chk.estimate.mean)}`,
    ] });
    saveFile({ suggestedName: `${symbol}_${method}_swath_${axis}.csv`.replace(/[^a-z0-9_.-]+/gi, "_"), filters: [{ name: "CSV", extensions: ["csv"] }], content: withStamp(toExportCsv(rows), stamp) });
  };

  const td = { textAlign: "end", padding: "2px 8px", fontVariantNumeric: "tabular-nums" };
  return (
    <div style={{ border: "1px solid var(--color-border)", borderRadius: 6, padding: "8px 10px", marginTop: 6 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{tr("Check this estimate")}</div>
      <table style={{ borderCollapse: "collapse", marginBottom: 4 }}>
        <tbody>
          <tr><td style={{ padding: "2px 8px 2px 0" }}>{tr("Composite mean (length-weighted, clustered)")}</td><td style={td}>{sig(chk.composites.mean)} {unit}</td><td style={{ ...td, color: "var(--color-text-secondary)" }}>{tr("{n} composites", { n: chk.composites.n.toLocaleString() })}</td></tr>
          <tr><td style={{ padding: "2px 8px 2px 0" }}>{tr("Nearest-neighbour mean (declustered)")}</td><td style={td}>{sig(chk.nn.mean)} {unit}</td><td style={{ ...td, color: "var(--color-text-secondary)" }} rowSpan={2}>{tr("over the same {n} blocks", { n: chk.estimate.n.toLocaleString() })}</td></tr>
          <tr><td style={{ padding: "2px 8px 2px 0" }}>{tr("Estimate mean ({method})", { method })}</td><td style={td}>{sig(chk.estimate.mean)} {unit}</td></tr>
        </tbody>
      </table>
      <div style={{ fontSize: "var(--font-size-sm)", lineHeight: 1.5, color: far ? "var(--color-warn-text)" : "var(--color-text-secondary)" }}>
        {d == null ? null : Math.abs(d) < 0.5 ? tr("The estimate's mean matches the nearest-neighbour mean.") : d > 0
          ? tr("The estimate's mean is {pct}% above the nearest-neighbour mean.", { pct: Math.abs(d).toFixed(1) })
          : tr("The estimate's mean is {pct}% below the nearest-neighbour mean.", { pct: Math.abs(d).toFixed(1) })}
        {far ? ` ${tr("A gap of 10% or more usually means the search or the weights favour one part of the data: compare the swaths below.")}` : ""}
        {chk.nnVsCompositesPct != null && Math.abs(chk.nnVsCompositesPct) >= 5 ? ` ${tr("The composite mean is {pct}% {dir} the declustered mean: the drilling is clustered, so the composite mean is not the deposit's mean.", { pct: Math.abs(chk.nnVsCompositesPct).toFixed(0), dir: chk.nnVsCompositesPct > 0 ? tr("above") : tr("below") })}` : ""}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "8px 0 4px" }} role="tablist" aria-label={tr("Swath direction")}>
        <span style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>{tr("Swath along")}</span>
        {AXES.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={axis === k} onClick={() => setAxis(k)} style={{ padding: "3px 9px", borderRadius: 5, fontSize: "var(--font-size-sm)", cursor: "pointer", border: "1px solid var(--color-border)", background: axis === k ? "var(--color-bg-subtle)" : "transparent", color: "var(--color-text)", fontWeight: axis === k ? 600 : 400 }}>{tr(label)}</button>
        ))}
        <button onClick={exportCsv} title={tr("Export the swath as CSV")} style={{ marginInlineStart: "auto", display: "flex", alignItems: "center", gap: 4, padding: "3px 9px", borderRadius: 5, fontSize: "var(--font-size-sm)", cursor: "pointer", border: "1px solid var(--color-border)", background: "transparent", color: "var(--color-text)" }}><Download size={12} />{" "}{tr("CSV")}</button>
      </div>
      {bins.length > 0 && (
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={tr("Swath plot")} style={{ display: "block" }} dir="ltr">
          <line x1={L} y1={H - B} x2={W - R} y2={H - B} stroke="#94a1b0" /><line x1={L} y1={T} x2={L} y2={H - B} stroke="#94a1b0" />
          {bins.map((b, i) => b.compositeN > 0 && <rect key={i} x={sx(b.from) + 1} y={H - B - 3} width={Math.max(1, sx(b.to) - sx(b.from) - 2)} height={3} fill="#c9d1db"><title>{tr("{n} composites", { n: b.compositeN })}</title></rect>)}
          {SERIES.map(([k, c, dash]) => line(k).map((seg, i) => seg.length > 1
            ? <polyline key={`${k}${i}`} fill="none" stroke={c} strokeWidth="2" strokeDasharray={dash || undefined} points={seg.join(" ")} />
            : <circle key={`${k}${i}`} cx={seg[0].split(",")[0]} cy={seg[0].split(",")[1]} r="2.5" fill={c} />))}
          <text x={L - 4} y={T + 8} fontSize="10" textAnchor="end" fill="#55606e">{sig(y1)}</text>
          <text x={L - 4} y={H - B} fontSize="10" textAnchor="end" fill="#55606e">0</text>
          <text x={L} y={H - 12} fontSize="10" fill="#55606e">{Math.round(x0).toLocaleString()}</text>
          <text x={W - R} y={H - 12} fontSize="10" textAnchor="end" fill="#55606e">{Math.round(x1).toLocaleString()}</text>
          <text x={(L + W - R) / 2} y={H - 2} fontSize="10" textAnchor="middle" fill="#55606e">{tr("{axis} (m) — {unit}", { axis: tr(AXES.find((a) => a[0] === axis)[1]), unit })}</text>
        </svg>
      )}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)" }}>
        {SERIES.map(([k, c, dash, label]) => <span key={k} style={{ display: "flex", alignItems: "center", gap: 4 }}><svg width="18" height="6" aria-hidden="true"><line x1="0" y1="3" x2="18" y2="3" stroke={c} strokeWidth="2" strokeDasharray={dash || undefined} /></svg>{label}</span>)}
      </div>
      <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.5, marginTop: 4 }}>{tr("The nearest-neighbour model is a second pass over the same grid, search and domains, taking each block's closest composite: its mean is a declustered mean. The block means count only the blocks both models filled; the grey ticks show slices that hold composites.")}</div>
    </div>
  );
}
