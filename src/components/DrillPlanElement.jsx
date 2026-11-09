// TASKS.csv #1639 — the Layout's drill-hole location plan (lib/drillPlan.js has the geometry): a white map frame with each hole's
// trace (0.3 mm), a collar symbol (1.6 mm), labels that do not overlap, and, coloured by series, a key. North is up.
import React, { useMemo } from "react";
import { drillPlanGeometry, placeLabels, drillPlanGrid } from "../lib/drillPlan.js"; // drillPlanGrid: #2301
import { CATEGORICAL_SAFE_COLORS } from "../lib/layers.js";
import { printPx, printPt } from "../lib/theme.js";

const INK = "#1a2028", FONT = "'Exo 2', system-ui, sans-serif";
const MM = 96 / 25.4;

export function drillPlanDrawing(el, collars) {
  const g = drillPlanGeometry(el, collars);
  const series = [...new Set(g.holes.map((hh) => hh.series))];
  const colourOf = (s) => (el.bySeries ? CATEGORICAL_SAFE_COLORS[series.indexOf(s) % CATEGORICAL_SAFE_COLORS.length] : INK);
  const fontPx = printPx(el.fontPt || printPt.caption);
  const f = String(el.labelFilter || "").trim().toLowerCase();
  const toLabel = el.labels === "none" ? [] : g.holes.filter((hh) => hh.inside && (!f || hh.id.toLowerCase().includes(f))).map((hh) => ({ id: hh.id, x: hh.ax, y: hh.ay }));
  const labels = placeLabels(toLabel, { fontPx, w: g.w, h: g.h });
  return { ...g, series, colourOf, fontPx, labels, labelled: toLabel.length };
}

// gridCaption (#2301): what the grid's numbers are ('local mine grid', the CRS name), from the page
export default function DrillPlanElement({ el, collars, gridCaption = "" }) {
  const d = useMemo(() => drillPlanDrawing(el, collars), [el, collars]);
  const grid = useMemo(() => drillPlanGrid(el), [el]);
  const r = 0.8 * MM, line = 0.3 * MM;
  return (
    <svg width={d.w} height={d.h} style={{ display: "block", background: "#ffffff" }} aria-label="drill plan">
      <defs><clipPath id={`dp_${el.id}`}><rect x="0" y="0" width={d.w} height={d.h} /></clipPath></defs>
      <g clipPath={`url(#dp_${el.id})`}>
        {grid && <g stroke="#d5dae1" strokeWidth={0.6}>{grid.xs.map((t) => <line key={`gx${t.px}`} x1={t.px} y1={0} x2={t.px} y2={d.h} />)}{grid.ys.map((t) => <line key={`gy${t.px}`} x1={0} y1={t.px} x2={d.w} y2={t.px} />)}</g>}{/* #2301 */}
        {grid && <g fontSize={Math.max(6, d.fontPx - 1)} fill="#55606e" fontFamily={FONT} stroke="#ffffff" strokeWidth={2} paintOrder="stroke">
          {grid.xs.map((t) => <text key={`lx${t.px}`} x={t.px + 2} y={Math.max(6, d.fontPx - 1) + 1}>{t.label}</text>)}
          {grid.ys.map((t) => <text key={`ly${t.px}`} x={2} y={t.px - 2}>{t.label}</text>)}
          <text x={d.w - 4} y={d.h - 4} textAnchor="end">{gridCaption ? `Grid ${grid.spacing.toLocaleString("en-US")} m, ${gridCaption}` : `Grid ${grid.spacing.toLocaleString("en-US")} m`}</text>
        </g>}
        {d.holes.map((hh) => <line key={`t${hh.id}`} x1={hh.ax} y1={hh.ay} x2={hh.bx} y2={hh.by} stroke={d.colourOf(hh.series)} strokeWidth={line} strokeLinecap="round" />)}
        {d.holes.filter((hh) => hh.inside).map((hh) => <circle key={`c${hh.id}`} cx={hh.ax} cy={hh.ay} r={r} fill={d.colourOf(hh.series)} stroke="#ffffff" strokeWidth={0.6} />)}
        {d.labels.placed.map((l) => <text key={`l${l.id}`} x={l.x} y={l.y} textAnchor={l.anchor} fontSize={d.fontPx} fill={INK} stroke="#ffffff" strokeWidth={2.5} paintOrder="stroke" fontFamily={FONT}>{l.id}</text>)}
      </g>
      {el.bySeries && d.series.length > 0 && (
        <g transform="translate(6,6)">
          <rect x="0" y="0" width={Math.max(...d.series.map((s) => s.length)) * d.fontPx * 0.56 + 26} height={d.series.length * (d.fontPx + 4) + 6} fill="rgba(255,255,255,0.9)" stroke="#c9ced4" />
          {d.series.map((s, i) => (
            <g key={s} transform={`translate(8,${8 + i * (d.fontPx + 4)})`}>
              <circle cx="3" cy={d.fontPx / 2 - 1} r={r} fill={d.colourOf(s)} />
              <text x="12" y={d.fontPx - 1} fontSize={d.fontPx} fill={INK} fontFamily={FONT}>{s}</text>
            </g>
          ))}
        </g>
      )}
    </svg>
  );
}
