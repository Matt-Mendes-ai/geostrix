// TASKS.csv #1639 — the Layout's drill-hole location plan (lib/drillPlan.js has the geometry): a white map frame with each hole's
// trace (0.3 mm), a collar symbol (1.6 mm), labels that do not overlap, and, when coloured (by series, a collar field or a grade:
// #2473), a key. North is up.
import React, { useMemo } from "react";
import { drillPlanGeometry, placeLabels, drillPlanGrid, drillPlanColouring, colourByKind } from "../lib/drillPlan.js"; // drillPlanGrid: #2301; colouring: #2473
import { resolvedSegments, gradeUnitLabel } from "../lib/geochem.js"; // TASKS.csv #2473
import { CATEGORICAL_SAFE_COLORS } from "../lib/layers.js";
import { printPx, printPt } from "../lib/theme.js";

const INK = "#1a2028", FONT = "'Exo 2', system-ui, sans-serif";
const MM = 96 / 25.4;

// TASKS.csv #2473 — the resolved assay segments and unit label a grade colouring needs (resolvedSegments is cached per assay list)
export function drillPlanGradeInput(el, assays, assayElements) {
  const { kind, key } = colourByKind(el?.colourBy);
  if ((kind !== "max" && kind !== "gt") || !key || !assays?.length) return { segs: null, unit: "" };
  const units = Object.fromEntries((assayElements || []).map((e) => [e.symbol, e.unit || "ppm"]));
  const unit = units[key] || "ppm";
  return { segs: resolvedSegments(assays, key, unit, units), unit: gradeUnitLabel(key, unit) };
}

export function drillPlanDrawing(el, collars, assays = null, assayElements = null) {
  const g = drillPlanGeometry(el, collars);
  const colouring = drillPlanColouring(el, g.holes, collars, { ...drillPlanGradeInput(el, assays, assayElements), palette: CATEGORICAL_SAFE_COLORS, ink: INK });
  const fontPx = printPx(el.fontPt || printPt.caption);
  const f = String(el.labelFilter || "").trim().toLowerCase();
  const toLabel = el.labels === "none" ? [] : g.holes.filter((hh) => hh.inside && (!f || hh.id.toLowerCase().includes(f))).map((hh) => ({ id: hh.id, x: hh.ax, y: hh.ay }));
  // the key's box (top left), which no hole label may run under (#2473)
  const keyLines = [colouring.title, colouring.note].filter(Boolean), keyRow = fontPx + 4;
  const keyBox = colouring.key.length ? { x: 6, y: 6, lines: keyLines, row: keyRow,
    w: Math.max(0, ...colouring.key.map((k) => k.label.length * fontPx * 0.56 + 26), ...keyLines.map((t, i) => t.length * (i ? fontPx - 1 : fontPx) * (i ? 0.5 : 0.56) + 16)),
    h: (keyLines.length + colouring.key.length) * keyRow + 6 } : null;
  const labels = placeLabels(toLabel, { fontPx, w: g.w, h: g.h, avoid: keyBox ? [{ x0: keyBox.x, y0: keyBox.y, x1: keyBox.x + keyBox.w, y1: keyBox.y + keyBox.h }] : [] });
  return { ...g, colouring, fontPx, labels, labelled: toLabel.length, keyBox };
}

// gridCaption (#2301): what the grid's numbers are ('local mine grid', the CRS name), from the page
export default function DrillPlanElement({ el, collars, gridCaption = "", assays = null, assayElements = null }) {
  const d = useMemo(() => drillPlanDrawing(el, collars, assays, assayElements), [el, collars, assays, assayElements]);
  const grid = useMemo(() => drillPlanGrid(el), [el]);
  const line = 0.3 * MM, { colouring, keyBox } = d;
  const styles = useMemo(() => new Map(d.holes.map((hh) => [hh.id, d.colouring.styleOf(hh.id, hh.series)])), [d]);
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
        {d.holes.map((hh) => <line key={`t${hh.id}`} x1={hh.ax} y1={hh.ay} x2={hh.bx} y2={hh.by} stroke={styles.get(hh.id).hollow ? INK : styles.get(hh.id).colour} strokeWidth={line} strokeLinecap="round" />)}
        {/* #2473 — a hole with no value is a hollow ring; higher grade classes are drawn last, on top */}
        {d.holes.filter((hh) => hh.inside).sort((a, b) => styles.get(a.id).rMm - styles.get(b.id).rMm).map((hh) => { const s = styles.get(hh.id); return s.hollow
          ? <circle key={`c${hh.id}`} cx={hh.ax} cy={hh.ay} r={s.rMm * MM} fill="#ffffff" stroke={s.colour} strokeWidth={0.9} />
          : <circle key={`c${hh.id}`} cx={hh.ax} cy={hh.ay} r={s.rMm * MM} fill={s.colour} stroke="#ffffff" strokeWidth={0.6} />; })}
        {d.labels.placed.map((l) => <text key={`l${l.id}`} x={l.x} y={l.y} textAnchor={l.anchor} fontSize={d.fontPx} fill={INK} stroke="#ffffff" strokeWidth={2.5} paintOrder="stroke" fontFamily={FONT}>{l.id}</text>)}
      </g>
      {keyBox && (
        <g transform={`translate(${keyBox.x},${keyBox.y})`}>
          <rect x="0" y="0" width={keyBox.w} height={keyBox.h} fill="rgba(255,255,255,0.9)" stroke="#c9ced4" />
          {keyBox.lines.map((t, i) => <text key={`kt${i}`} x="8" y={8 + i * keyBox.row + d.fontPx - 1} fontSize={i ? d.fontPx - 1 : d.fontPx} fontWeight={i ? 400 : 600} fill={i ? "#55606e" : INK} fontFamily={FONT}>{t}</text>)}
          {colouring.key.map((k, i) => (
            <g key={`k${i}`} transform={`translate(8,${8 + (keyBox.lines.length + i) * keyBox.row})`}>
              {k.hollow ? <circle cx="4" cy={d.fontPx / 2 - 1} r={k.rMm * MM} fill="#ffffff" stroke={k.colour} strokeWidth={0.9} /> : <circle cx="4" cy={d.fontPx / 2 - 1} r={k.rMm * MM} fill={k.colour} />}
              <text x="14" y={d.fontPx - 1} fontSize={d.fontPx} fill={INK} fontFamily={FONT}>{k.label}</text>
            </g>
          ))}
        </g>
      )}
    </svg>
  );
}
