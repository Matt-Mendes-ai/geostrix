// TASKS.csv #2981 (split from #2000) — the levelling tie scatter, as Main & Champion (2022) read it before trusting a level: each tie site's
// survey value (x) against the reference's (y) on log axes, the 1:1 line, the median-ratio line and the Huber line; a tie the Huber fit gives
// less weight is drawn hollow. data: lib/levelling.js tieScatter. SVG presentation colours from theme.js (an exported figure keeps them).
import React from "react";
import { t as tr } from "../lib/i18n.js";
import { colors, fontSizes } from "../lib/theme.js";

const W = 300, H = 230, PL = 44, PB = 34, PR = 10, PT = 10;
const fmt = (v) => (v >= 100 ? Math.round(v).toLocaleString() : v >= 1 ? String(+v.toPrecision(3)) : String(+v.toPrecision(2)));

export default function TieScatterPlot({ data, reference, survey, unit }) {
  if (!data) return null;
  const { lo, hi } = data, X = (v) => PL + ((v - lo) / (hi - lo)) * (W - PL - PR), Y = (v) => H - PB - ((v - lo) / (hi - lo)) * (H - PB - PT);
  const ticks = [];
  for (let d = Math.ceil(lo); d <= Math.floor(hi); d++) ticks.push(d);
  if (ticks.length < 2) ticks.splice(0, ticks.length, lo + (hi - lo) * 0.25, lo + (hi - lo) * 0.75);
  const line = (f, key, stroke, dash) => <line key={key} x1={X(lo)} y1={Y(f(lo))} x2={X(hi)} y2={Y(f(hi))} stroke={stroke} strokeWidth={1.4} strokeDasharray={dash} />;
  const down = data.points.filter((p) => p.down).length;
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={tr("Tie scatter: the survey's value against the reference's at each tie site")} style={{ flexShrink: 0, background: colors.bg || "#ffffff" }}>
        <defs><clipPath id="tie-clip"><rect x={PL} y={PT} width={W - PL - PR} height={H - PB - PT} /></clipPath></defs>
        <rect x={PL} y={PT} width={W - PL - PR} height={H - PB - PT} fill="none" stroke={colors.border || "#c9ced4"} />
        {ticks.map((d) => <g key={d}>
          <text x={X(d)} y={H - PB + 13} textAnchor="middle" fontSize={fontSizes.xs} fill={colors.textMuted || "#65717e"}>{fmt(10 ** d)}</text>
          <text x={PL - 4} y={Y(d) + 3} textAnchor="end" fontSize={fontSizes.xs} fill={colors.textMuted || "#65717e"}>{fmt(10 ** d)}</text>
        </g>)}
        <text x={(PL + W - PR) / 2} y={H - 4} textAnchor="middle" fontSize={fontSizes.xs} fill={colors.textSecondary || "#55606e"}>{tr("{s} ({u})", { s: survey, u: unit })}</text>
        <text x={10} y={(PT + H - PB) / 2} textAnchor="middle" fontSize={fontSizes.xs} fill={colors.textSecondary || "#55606e"} transform={`rotate(-90 10 ${(PT + H - PB) / 2})`}>{tr("{s} ({u})", { s: reference, u: unit })}</text>
        <g clipPath="url(#tie-clip)">
          {line((v) => v, "one", "#9aa3ad", "4 3")}
          {data.median != null && line((v) => v + data.median, "med", "#0072B2")}
          {data.huber && line((v) => data.huber.a + data.huber.b * v, "hub", "#D55E00", "6 2")}
          {data.points.map((p, i) => <circle key={i} cx={X(p.x)} cy={Y(p.y)} r={2.6} fill={p.down ? "none" : "#2a3444"} stroke="#2a3444" strokeWidth={0.9} />)}
        </g>
      </svg>
      <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", lineHeight: 1.6, maxWidth: 260 }}>
        <div><span style={{ display: "inline-block", width: 18, borderTop: "2px dashed #9aa3ad", verticalAlign: "middle", marginRight: 6 }} />{tr("1:1 (no difference)")}</div>
        {data.median != null && <div><span style={{ display: "inline-block", width: 18, borderTop: "2px solid #0072B2", verticalAlign: "middle", marginRight: 6 }} />{tr("Median ratio (the tie level)")}</div>}
        {data.huber && <div><span style={{ display: "inline-block", width: 18, borderTop: "2px dashed #D55E00", verticalAlign: "middle", marginRight: 6 }} />{tr("Huber line (the regression level)")}</div>}
        {data.huber && down > 0 && <div>{tr("Hollow: {n} tie(s) the Huber line gives less weight.", { n: down })}</div>}
        <div style={{ color: "var(--color-text-muted)", marginTop: 4 }}>{tr("Ties that scatter widely, or a line that bends away from the points at either end, mean the level should not be trusted there.")}</div>
      </div>
    </div>
  );
}
