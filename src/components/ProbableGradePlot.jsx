// TASKS.csv #3962 (P1) — a planned hole's probable grade down its length (design.md 1.2): the band between the low (P10) and high (P90)
// grade of each composite across the model's runs, the middle (P50) line, and the cut-off. Depth down the hole runs down the page;
// where the hole is beyond the drilling there is no band. Drawn from the frozen prediction on the hole, so it never changes by itself.
// SVG presentation attributes take theme.js colours (var() does not resolve there).
import React from "react";
import { colors } from "../lib/theme.js";
import { t as tr } from "../lib/i18n.js";
import { fmt } from "../lib/drillPlanner/predictionInputs.js";
import { arrMin, arrMax } from "../lib/arrayStats.js"; // #3031 — no spread over a long array

const W = 240, PAD_L = 34, PAD_R = 8, PAD_T = 6, PAD_B = 22;

export default function ProbableGradePlot({ prediction: p }) {
  if (!p || p.beyond || !p.band?.md?.length) return null;
  const { md, p10, p50, p90 } = p.band, cut = p.rules?.cutoff;
  const L = p.lengthM || md[md.length - 1] + p.step / 2;
  const H = Math.max(140, Math.min(320, Math.round(L * 0.9))) + PAD_T + PAD_B;
  const gMax = Math.max(arrMax(p90), Number(cut) || 0) * 1.05 || 1;
  // grades are skewed: past a 30-fold spread the grade axis is logarithmic (as a grade log is), from the lowest positive low (P10) up
  const lows = [...p10, ...p50].filter((g) => g > 0), gMin = Math.max(lows.length ? arrMin(lows) : gMax / 1000, gMax / 1000);
  const logX = gMax / gMin > 30;
  const frac = (g) => (logX ? (Math.log10(Math.max(g, gMin)) - Math.log10(gMin)) / (Math.log10(gMax) - Math.log10(gMin)) : Math.max(0, g) / gMax);
  const x = (g) => PAD_L + frac(g) * (W - PAD_L - PAD_R), y = (d) => PAD_T + (d / L) * (H - PAD_T - PAD_B);
  // runs of consecutive composites (a gap beyond the drilling breaks the band)
  const runs = []; let cur = [];
  md.forEach((d, i) => { if (cur.length && d - md[cur[cur.length - 1]] > p.step * 1.5) { runs.push(cur); cur = []; } cur.push(i); });
  if (cur.length) runs.push(cur);
  const decades = logX ? Array.from({ length: Math.floor(Math.log10(gMax)) - Math.ceil(Math.log10(gMin)) + 1 }, (_, i) => 10 ** (Math.ceil(Math.log10(gMin)) + i)).slice(-4)
    : null;
  const ticks = decades?.length ? decades : (logX ? [gMin, gMax / 1.05] : [0, gMax / 2, gMax / 1.05]).map((g) => Number(g.toPrecision(2)));
  const unit = p.unit || "";
  // the axis title is HTML above the figure, so an Arabic title reads in the page's direction (the figure itself is drawn left to right)
  return (<div>
    <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", marginBottom: 2 }}>{tr(logX ? "{element} ({unit}, log scale); depth down the hole (m)" : "{element} ({unit}); depth down the hole (m)", { element: p.element, unit })}</div>
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" data-probable-plot=""
      aria-label={tr("Probable {element} down the hole: the low to high band (P10 to P90) and the middle line (P50), with the cut-off", { element: p.element })}>
      <rect x={PAD_L} y={PAD_T} width={W - PAD_L - PAD_R} height={H - PAD_T - PAD_B} fill="none" stroke={colors.border} />
      {runs.map((r, k) => (
        <g key={k}>
          <polygon points={[...r.map((i) => `${x(p10[i])},${y(md[i])}`), ...r.slice().reverse().map((i) => `${x(p90[i])},${y(md[i])}`)].join(" ")} fill={colors.planned} fillOpacity="0.25" stroke="none" />
          <polyline points={r.map((i) => `${x(p50[i])},${y(md[i])}`).join(" ")} fill="none" stroke={colors.planned} strokeWidth="1.5" />
        </g>
      ))}
      {Number(cut) > 0 && <line x1={x(cut)} x2={x(cut)} y1={PAD_T} y2={H - PAD_B} stroke={colors.textSecondary} strokeDasharray="4 3" />}
      {ticks.map((g) => <text key={g} x={x(g)} y={H - PAD_B + 12} fontSize="10" textAnchor="middle" fill={colors.textMuted}>{fmt(g)}</text>)}
      {[0, L / 2, L].map((d) => <text key={d} x={PAD_L - 4} y={y(d) + 3} fontSize="10" textAnchor="end" fill={colors.textMuted}>{Math.round(d)}</text>)}
      {Number(cut) > 0 && <text x={Math.min(x(cut) + 3, W - PAD_R - 2)} y={PAD_T + 11} fontSize="10" textAnchor={x(cut) > W - 60 ? "end" : "start"} fill={colors.textSecondary}>{tr("cut-off")}</text>}
    </svg>
  </div>);
}
