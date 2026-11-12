// TASKS.csv #1639 — the Layout's drill-hole location plan (lib/drillPlan.js has the geometry): a white map frame with each hole's
// trace (0.3 mm), a collar symbol (1.6 mm), labels that do not overlap, and, when coloured (by series, a collar field or a grade:
// #2473), a key. North is up.
import React, { useMemo } from "react";
import { drillPlanGeometry, placeLabels, drillPlanGrid, drillPlanColouring, colourByKind, emptiestCorner, labelBackdrop, drillPlanShapes, symbolPath } from "../lib/drillPlan.js"; // shapes: #2686; // labelBackdrop: #2738; // drillPlanGrid: #2301; colouring: #2473
import { resolvedSegments, gradeUnitLabel } from "../lib/geochem.js"; // TASKS.csv #2473
import { CATEGORICAL_SAFE_COLORS } from "../lib/layers.js";
import { printPx, printPt } from "../lib/theme.js";
import { t as tr } from "../lib/i18n.js"; // TASKS.csv #2686 — the shape key's circle row

const INK = "#1a2028", FONT = "'Exo 2', system-ui, sans-serif";
// TASKS.csv #2611 — the categorical palette without its yellow (#F0E442 with a white outline vanished on the white map)
const ON_WHITE = CATEGORICAL_SAFE_COLORS.filter((c) => String(c).toUpperCase() !== "#F0E442");
const MM = 96 / 25.4, MM_PX = MM;

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
  const colouring = drillPlanColouring(el, g.holes, collars, { ...drillPlanGradeInput(el, assays, assayElements), palette: ON_WHITE, ink: INK });
  const shapes = drillPlanShapes(collars, el.shapeBy, g.holes.map((hh) => hh.id)); // #2686 — a symbol shape by a collar field
  const shapeKey = shapes.key.map((k) => ({ ...k, label: `${el.shapeBy}: ${k.shape === "circle" ? (k.label === "not recorded" ? tr("not recorded") : tr("other / not recorded")) : k.label}` }));
  const fontPx = printPx(el.fontPt || printPt.caption);
  const f = String(el.labelFilter || "").trim().toLowerCase();
  const toLabel = el.labels === "none" ? [] : g.holes.filter((hh) => hh.inside && (!f || hh.id.toLowerCase().includes(f))).map((hh) => ({ id: hh.id, x: hh.ax, y: hh.ay }));
  // the key's box (top left), which no hole label may run under (#2473)
  const keyLines = [colouring.title, colouring.note].filter(Boolean), keyRow = fontPx + 4;
  const keyRows = colouring.key.length + shapeKey.length; // #2686 — the shapes listed under the colours
  let keyBox = keyRows ? { x: 6, y: 6, lines: keyLines, row: keyRow,
    w: Math.max(0, ...[...colouring.key, ...shapeKey].map((k) => k.label.length * fontPx * 0.56 + 26), ...keyLines.map((t, i) => t.length * (i ? fontPx - 1 : fontPx) * (i ? 0.5 : 0.56) + 16)),
    h: (keyLines.length + keyRows) * keyRow + 6 } : null;
  // TASKS.csv #2611 — the key in the corner with the fewest holes (the top left held the first northing label and the collars)
  if (keyBox) {
    keyBox = { ...keyBox, ...emptiestCorner(g.holes, g.w, g.h, keyBox.w, keyBox.h) };
  }
  // TASKS.csv #2611 — labels keep off the other holes' collars as well as each other
  const r = (el.collarMm || 0.8) * MM_PX + 1;
  const collarBoxes = g.holes.filter((hh) => hh.inside).map((hh) => ({ x0: hh.ax - r, y0: hh.ay - r, x1: hh.ax + r, y1: hh.ay + r }));
  const labels = placeLabels(toLabel, { fontPx, w: g.w, h: g.h, avoid: [...(keyBox ? [{ x0: keyBox.x, y0: keyBox.y, x1: keyBox.x + keyBox.w, y1: keyBox.y + keyBox.h }] : []), ...collarBoxes] });
  return { ...g, colouring, shapes, shapeKey, fontPx, labels, labelled: toLabel.length, keyBox };
}

// gridCaption (#2301): what the grid's numbers are ('local mine grid', the CRS name), from the page
export default function DrillPlanElement({ el, collars, gridCaption = "", assays = null, assayElements = null }) {
  const d = useMemo(() => drillPlanDrawing(el, collars, assays, assayElements), [el, collars, assays, assayElements]);
  const grid = useMemo(() => drillPlanGrid(el), [el]);
  const line = 0.3 * MM, { colouring, keyBox } = d; // keyBox: placed in drillPlanDrawing (#2611)
  const styles = useMemo(() => new Map(d.holes.map((hh) => [hh.id, d.colouring.styleOf(hh.id, hh.series)])), [d]);
  return (
    <svg width={d.w} height={d.h} style={{ display: "block", background: "#ffffff" }} aria-label="drill plan">
      <defs><clipPath id={`dp_${el.id}`}><rect x="0" y="0" width={d.w} height={d.h} /></clipPath></defs>
      <g clipPath={`url(#dp_${el.id})`}>
        {grid && <g stroke="#d5dae1" strokeWidth={0.6}>{grid.xs.map((t) => <line key={`gx${t.px}`} x1={t.px} y1={0} x2={t.px} y2={d.h} />)}{grid.ys.map((t) => <line key={`gy${t.px}`} x1={0} y1={t.px} x2={d.w} y2={t.px} />)}</g>}{/* #2301 */}
        {grid && (() => { /* #2738 — a white box behind each label, not a stroked halo (one text per label in the PDF) */
          const gf = Math.max(6, d.fontPx - 1), cap = gridCaption ? `Grid ${grid.spacing.toLocaleString("en-US")} m, ${gridCaption}` : `Grid ${grid.spacing.toLocaleString("en-US")} m`;
          const boxed = (key, text, x, y, anchor = "start") => { const b = labelBackdrop(text, x, y, gf, anchor); return <g key={key}><rect x={b.x} y={b.y} width={b.w} height={b.h} fill="#ffffff" fillOpacity="0.85" /><text x={x} y={y} textAnchor={anchor}>{text}</text></g>; };
          return <g fontSize={gf} fill="#55606e" fontFamily={FONT}>
            {grid.xs.filter((t) => !(keyBox && keyBox.y < d.fontPx + 2 && t.px + 2 < keyBox.x + keyBox.w && t.px + 2 + t.label.length * d.fontPx * 0.5 > keyBox.x)).map((t) => boxed(`lx${t.px}`, t.label, t.px + 2, gf + 1))}
            {grid.ys.filter((t) => !(keyBox && keyBox.x < 2 + t.label.length * d.fontPx * 0.5 && t.px - d.fontPx < keyBox.y + keyBox.h && t.px > keyBox.y)).map((t) => boxed(`ly${t.px}`, t.label, 2, t.px - 2))}{/* #2611 — not under the key */}
            {boxed("cap", cap, d.w - 4, d.h - 4, "end")}
          </g>;
        })()}
        {d.holes.map((hh) => <line key={`t${hh.id}`} x1={hh.ax} y1={hh.ay} x2={hh.bx} y2={hh.by} stroke={styles.get(hh.id).hollow ? INK : styles.get(hh.id).colour} strokeWidth={line} strokeLinecap="round" />)}
        {/* #2473 — a hole with no value is a hollow ring; higher grade classes are drawn last, on top */}
        {d.holes.filter((hh) => hh.inside).sort((a, b) => styles.get(a.id).rMm - styles.get(b.id).rMm).map((hh) => { const s = styles.get(hh.id), path = symbolPath(d.shapes.shapeOf(hh.id), hh.ax, hh.ay, s.rMm * MM); /* #2686 */ return path
          ? <path key={`c${hh.id}`} d={path} fill={s.hollow ? "#ffffff" : s.colour} stroke={s.hollow ? s.colour : "#ffffff"} strokeWidth={s.hollow ? 0.9 : 0.6} />
          : s.hollow
          ? <circle key={`c${hh.id}`} cx={hh.ax} cy={hh.ay} r={s.rMm * MM} fill="#ffffff" stroke={s.colour} strokeWidth={0.9} />
          : <circle key={`c${hh.id}`} cx={hh.ax} cy={hh.ay} r={s.rMm * MM} fill={s.colour} stroke="#ffffff" strokeWidth={0.6} />; })}
        {d.labels.placed.map((l) => { const b = labelBackdrop(l.id, l.x, l.y, d.fontPx, l.anchor); return <g key={`l${l.id}`}><rect x={b.x} y={b.y} width={b.w} height={b.h} fill="#ffffff" fillOpacity="0.85" /><text x={l.x} y={l.y} textAnchor={l.anchor} fontSize={d.fontPx} fill={INK} fontFamily={FONT}>{l.id}</text></g>; })}{/* #2738 — boxed, not haloed */}
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
          {d.shapeKey.map((k, i) => { const cy = d.fontPx / 2 - 1, r = (el.collarMm || 0.8) * MM, path = symbolPath(k.shape, 4, cy, r); /* #2686 */ return (
            <g key={`ks${i}`} transform={`translate(8,${8 + (keyBox.lines.length + colouring.key.length + i) * keyBox.row})`}>
              {path ? <path d={path} fill="#ffffff" stroke={INK} strokeWidth={0.9} /> : <circle cx="4" cy={cy} r={r} fill="#ffffff" stroke={INK} strokeWidth={0.9} />}
              <text x="14" y={d.fontPx - 1} fontSize={d.fontPx} fill={INK} fontFamily={FONT}>{k.label}</text>
            </g>
          ); })}
        </g>
      )}
    </svg>
  );
}
