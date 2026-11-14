// TASKS.csv #2629 — QAQC > Method pairs: an element measured by two lab methods on the same samples (U and U_103, V and V_101), each
// method column against the element's own value: the bias (median ratio), the median RPD and a 1:1 plot (lib/qaqc.js methodPairs).
import React, { useState } from "react";
import { t as tr } from "../lib/i18n.js";
import { fontSizes } from "../lib/theme.js";
import { swapInMethod, isDifferentMeasurement } from "../lib/qaqc.js"; // TASKS.csv #2687; isDifferentMeasurement: #3220

const fmt = (x) => (x == null || !Number.isFinite(x) ? "—" : Math.abs(x) >= 1000 ? Math.round(x).toLocaleString() : String(+x.toPrecision(3)));
const th = { textAlign: "right", padding: "3px 8px", borderBottom: "1px solid var(--color-border)" };
const td = { textAlign: "right", padding: "3px 8px", borderBottom: "1px solid var(--color-border-light)" };

// the element's value (x) against the other method's (y), log axes, with the 1:1 line and the median ratio's line
function MethodScatter({ g, unit, symbol }) {
  const pos = g.pairs.filter((p) => p.v1 > 0 && p.v2 > 0);
  if (!pos.length) return null;
  const w = 340, h = 300, p0 = 42;
  let lo = Infinity, hi = -Infinity;
  for (const p of pos) for (const v of [p.v1, p.v2]) { const l = Math.log10(v); if (l < lo) lo = l; if (l > hi) hi = l; }
  if (!(hi > lo)) { lo -= 0.5; hi += 0.5; }
  const S = (v) => p0 + ((Math.log10(v) - lo) / (hi - lo)) * (w - p0 - 10), T = (v) => h - p0 - ((Math.log10(v) - lo) / (hi - lo)) * (h - p0 - 10);
  const a = 10 ** lo, b = 10 ** hi, r = g.medianRatio;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} style={{ display: "block", maxWidth: "100%" }} role="img" aria-label={tr("{a} against {b}", { a: g.header, b: symbol })}>
      <rect x={p0} y={10} width={w - p0 - 10} height={h - p0 - 10} fill="none" style={{ stroke: "var(--color-border)" }} />
      <line x1={S(a)} y1={T(a)} x2={S(b)} y2={T(b)} style={{ stroke: "#009E73" }} />
      {r > 0 && Math.abs(r - 1) > 0.01 && <line x1={S(Math.max(a, a / r))} y1={T(Math.max(a, a / r) * r)} x2={S(Math.min(b, b / r))} y2={T(Math.min(b, b / r) * r)} style={{ stroke: "#D55E00", strokeDasharray: "4 3" }} />}
      {pos.map((p, i) => <circle key={i} cx={S(p.v1)} cy={T(p.v2)} r={2.8} style={{ fill: "var(--color-text-secondary)" }}><title>{`${p.sample_id || `${p.hole_id} ${p.from}-${p.to}`}: ${fmt(p.v1)} / ${fmt(p.v2)} ${unit}, ${p.rpd.toFixed(0)}%`}</title></circle>)}
      <text x={(w + p0) / 2} y={h - 8} textAnchor="middle" fontSize={fontSizes.xs} style={{ fill: "var(--color-text-muted)" }}>{tr("{name} ({unit}, log)", { name: g.base || symbol, unit })}</text>
      <text x={12} y={h / 2} textAnchor="middle" fontSize={fontSizes.xs} transform={`rotate(-90 12 ${h / 2})`} style={{ fill: "var(--color-text-muted)" }}>{g.header}</text>
    </svg>
  );
}

export default function MethodPairsTab({ methods, symbol, unit, assays = null, setAssays = null }) { // assays / setAssays: #2687
  const [pick, setPick] = useState(0);
  const [asking, setAsking] = useState(false); // #2687 — the swap asks first, inline
  const [done, setDone] = useState("");
  if (!methods.length) {
    return <div style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", padding: 8 }}>{tr("No sample carries {symbol} by a second lab method. Method pairs come from the element's other method columns in the assay file (U_103 beside U), kept at import from now on: re-import a file to see its pairs.", { symbol })}</div>;
  }
  const g = methods[Math.min(pick, methods.length - 1)];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
      <div>{tr("Samples analysed for {symbol} by two lab methods: the element's value (the column it was imported from) against each other method column. A median ratio away from 1 is a bias between the methods; mixing them in one column carries that bias into every grade.", { symbol })}</div>
      <table style={{ borderCollapse: "collapse", fontSize: "var(--font-size-sm)" }}>
        <thead><tr>{[tr("Method column"), tr("Against"), tr("Pairs"), tr("Median RPD"), tr("Median ratio (method / element)")].map((hd) => <th key={hd} style={th}>{hd}</th>)}</tr></thead>
        <tbody>
          {methods.map((m, i) => (
            <tr key={`${m.header}|${m.base}`} onClick={() => setPick(i)} style={{ cursor: "pointer", background: i === pick ? "var(--color-selected-bg)" : undefined }}>
              <td style={td}>{m.header}</td><td style={td}>{m.base || symbol}</td><td style={td}>{m.n.toLocaleString()}</td>
              <td style={td} title={isDifferentMeasurement(m) ? tr("Not a duplicate measurement: no RPD verdict") : undefined}>{m.medianRpd == null || isDifferentMeasurement(m) /* #3220 */ ? "—" : `${m.medianRpd.toFixed(1)} %`}</td><td style={td}>{fmt(m.medianRatio)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <MethodScatter g={g} unit={unit} symbol={symbol} />
      <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>{tr("Green: the 1:1 line. Dashed: the median ratio. Censored ('<' / '>') results are left out.")}</div>
      {isDifferentMeasurement(g) && <div role="status" style={{ color: "var(--color-warn-text)" }}>{tr("{m} reads {r} times {symbol} on the median sample: a different measurement (a partial or soluble digest, say), not a bias between two methods of one. It is not offered in place of {symbol}; Calc. element can take its ratio to {symbol}.", { m: g.header, r: fmt(g.medianRatio), symbol })}</div>}{/* #3220 */}
      {setAssays && assays && !isDifferentMeasurement(g) /* #3220 — never offered over a total */ && ( /* TASKS.csv #2687 — use the other method's results as the element's value */
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          {!asking ? <button type="button" onClick={() => { setAsking(true); setDone(""); }}>{tr("Use {m} instead", { m: g.header })}</button> : <>
            <span>{tr("On every sample with a {m} result, {m} becomes the {symbol} value; the value it replaces is kept as a method result, so this can be swapped back. Every tool then reads {m}.", { m: g.header, symbol })}</span>
            <button type="button" onClick={() => { const r = swapInMethod(assays, symbol, g.header); setAssays(r.rows); setAsking(false); setDone(tr("{n} sample(s) now take {symbol} from {m}.", { n: r.swapped.toLocaleString(), symbol, m: g.header })); }}>{tr("Swap")}</button>
            <button type="button" onClick={() => setAsking(false)}>{tr("Cancel")}</button></>}
          {done && <span role="status" style={{ color: "var(--color-success-fg)" }}>{done}</span>}
        </div>
      )}
    </div>
  );
}
