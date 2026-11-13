// TASKS.csv #1639 — the Layout's drill-hole location plan (lib/drillPlan.js has the geometry): a white map frame with each hole's
// trace (0.3 mm), a collar symbol (1.6 mm), labels that do not overlap, and, when coloured (by series, a collar field or a grade:
// #2473), a key. North is up.
import React, { useMemo } from "react";
import { drillPlanGeometry, placeLabels, drillPlanGrid, drillPlanColouring, colourByKind, emptiestCorner, labelBackdrop, drillPlanShapes, symbolPath, bestInterceptGT, p90Cutoff, capPlanKey } from "../lib/drillPlan.js"; // capPlanKey: #3026 // best intercept: #2685; // shapes: #2686; // labelBackdrop: #2738; // drillPlanGrid: #2301; colouring: #2473
import { resolvedSegments, gradeUnitLabel, computeBestIntercepts } from "../lib/geochem.js"; // TASKS.csv #2473; computeBestIntercepts: #2685
import { excludeQAQC } from "../lib/qaqc.js"; // TASKS.csv #2685 — QC inserts are not intercepts
import { CATEGORICAL_SAFE_COLORS } from "../lib/layers.js";
import { printPx, printPt } from "../lib/theme.js";
import { t as tr } from "../lib/i18n.js"; // TASKS.csv #2686 — the shape key's circle row

import { layoutFontStack } from "../lib/layoutFonts.js"; // TASKS.csv #2144
import { collarSpacing } from "../lib/planDots.js"; // TASKS.csv #3017 — the Maps plan's rule (#2989)
const INK = "#1a2028";
// TASKS.csv #2611 — the categorical palette without its yellow (#F0E442 with a white outline vanished on the white map)
const ON_WHITE = CATEGORICAL_SAFE_COLORS.filter((c) => String(c).toUpperCase() !== "#F0E442");
const MM = 96 / 25.4, MM_PX = MM;

// TASKS.csv #2685 — the best intercept per hole (grade × length) at the plan's own cut-off / dilution / minimum length, cached per assay
// list and rule: a drag of the frame redraws the plan without running the intercepts again
const biCache = new WeakMap();
export function drillPlanBiRule(el, assays, key) {
  const typed = Number(el?.biCutoff);
  const cutoff = el?.biCutoff !== "" && el?.biCutoff != null && Number.isFinite(typed) ? typed : p90Cutoff((assays || []).map((a) => a.values?.[key]));
  const dilution = Number.isFinite(Number(el?.biDilution)) && el?.biDilution !== "" && el?.biDilution != null ? Number(el.biDilution) : 2; // computeBestIntercepts' own default
  const minLength = Number.isFinite(Number(el?.biMinLength)) && el?.biMinLength !== "" && el?.biMinLength != null ? Number(el.biMinLength) : 0;
  return { cutoff, dilution, minLength, defaulted: !(el?.biCutoff !== "" && el?.biCutoff != null && Number.isFinite(typed)) };
}
function bestInterceptInput(el, assays, key, unit, units) {
  const r = drillPlanBiRule(el, assays, key);
  if (r.cutoff == null) return { perHole: new Map(), biRule: "" };
  const ck = `${key}|${unit}|${r.cutoff}|${r.dilution}|${r.minLength}`;
  let m = biCache.get(assays);
  if (!m) biCache.set(assays, (m = new Map()));
  if (!m.has(ck)) m.set(ck, bestInterceptGT(computeBestIntercepts(excludeQAQC(assays), key, unit, units, { cutoff: r.cutoff, maxInternalDilution: r.dilution, minLength: r.minLength })));
  const u = gradeUnitLabel(key, unit);
  return { perHole: m.get(ck), biRule: `cut-off ${r.cutoff} ${u}${r.defaulted ? " (the P90)" : ""}, at most ${r.dilution} m internal dilution${r.minLength ? `, at least ${r.minLength} m` : ""}` };
}

// TASKS.csv #2473 — the resolved assay segments and unit label a grade colouring needs (resolvedSegments is cached per assay list)
export function drillPlanGradeInput(el, assays, assayElements) {
  const { kind, key } = colourByKind(el?.colourBy);
  if ((kind !== "max" && kind !== "gt" && kind !== "bi") || !key || !assays?.length) return { segs: null, unit: "" };
  const units = Object.fromEntries((assayElements || []).map((e) => [e.symbol, e.unit || "ppm"]));
  const unit = units[key] || "ppm";
  if (kind === "bi") return { ...bestInterceptInput(el, assays, key, unit, units), unit: gradeUnitLabel(key, unit) }; // #2685
  return { segs: resolvedSegments(assays, key, unit, units), unit: gradeUnitLabel(key, unit) };
}

export function drillPlanDrawing(el, collars, assays = null, assayElements = null) {
  const g = drillPlanGeometry(el, collars);
  const colouring0 = drillPlanColouring(el, g.holes, collars, { ...drillPlanGradeInput(el, assays, assayElements), palette: ON_WHITE, ink: INK });
  const shapes = drillPlanShapes(collars, el.shapeBy, g.holes.map((hh) => hh.id)); // #2686 — a symbol shape by a collar field
  const shapeKey = shapes.key.map((k) => ({ ...k, label: `${el.shapeBy}: ${k.shape === "circle" ? (k.label === "not recorded" ? tr("not recorded") : tr("other / not recorded")) : k.label}` }));
  const fontPx = printPx(el.fontPt || printPt.caption);
  // TASKS.csv #3026 — a key of 125 series ran 1,672 px down an 800 px frame: it lists the rows the frame holds and says how many it left out
  const colouring = { ...colouring0, key: capPlanKey(colouring0.key, { frameH: g.h, rowPx: fontPx + 4, keyLines: [colouring0.title, colouring0.note].filter(Boolean).length, extra: shapeKey.length, moreLabel: (n) => tr("+ {n} more, not listed", { n }) }) };
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

// TASKS.csv #3182 (#3028 (8), review #2876) — the grid caption and the first northing label touched the frame ('...(EPSG:28350' looked cut): a
// northing label whose text would rise past the top edge sits below its line, an easting label that would run off the right edge ends at
// its line, and the caption keeps GRID_INSET px from the corner. t: drillPlanGrid's { px, label }; axis "x" (eastings) or "y" (northings)
export const GRID_INSET = 6;
export function gridLabelPlace(t, axis, fontPx, w, h) {
  const width = String(t.label).length * fontPx * 0.55;
  if (axis === "y") return { x: GRID_INSET, y: t.px - 2 - fontPx < GRID_INSET ? Math.min(h - GRID_INSET, t.px + fontPx + 1) : t.px - 2, anchor: "start" };
  return t.px + 2 + width > w - GRID_INSET ? { x: t.px - 2, y: fontPx + GRID_INSET - 2, anchor: "end" } : { x: t.px + 2, y: fontPx + GRID_INSET - 2, anchor: "start" };
}

// gridCaption (#2301): what the grid's numbers are ('local mine grid', the CRS name), from the page
export default function DrillPlanElement({ el, collars, gridCaption = "", assays = null, assayElements = null }) {
  const FONT = layoutFontStack(el?.fontFamily); // TASKS.csv #2144 — the element's typeface (none: Exo 2)
  const d = useMemo(() => drillPlanDrawing(el, collars, assays, assayElements), [el, collars, assays, assayElements]);
  const grid = useMemo(() => drillPlanGrid(el), [el]);
  const line = 0.3 * MM, { colouring, keyBox } = d; // keyBox: placed in drillPlanDrawing (#2611)
  const styles = useMemo(() => new Map(d.holes.map((hh) => [hh.id, d.colouring.styleOf(hh.id, hh.series)])), [d]);
  // TASKS.csv #3017 (review #2876, WA iron) — at 1:100,000 holes 25 m apart are 0.9 px apart: each collar's white outline painted over the one
  // before and the drilled blocks printed as pale blotches. Maps' rule (lib/planDots.js, #2989): a symbol no wider than 0.8 of the holes'
  // spacing on the sheet (at least 0.75 px), its outline only when they are 6 px apart or more, and a no-value ring left unfilled when dense
  const dense = useMemo(() => {
    const gap = collarSpacing(d.holes.filter((hh) => hh.inside).map((hh) => ({ x: hh.ax, y: hh.ay })));
    return { halo: !(gap < 6), cap: gap > 0 ? Math.max(0.75, 0.4 * gap) : Infinity };
  }, [d]);
  const rOf = (s) => Math.min(s.rMm * MM, dense.cap);
  return (
    <svg width={d.w} height={d.h} style={{ display: "block", background: "#ffffff" }} aria-label="drill plan">
      <defs><clipPath id={`dp_${el.id}`}><rect x="0" y="0" width={d.w} height={d.h} /></clipPath></defs>
      <g clipPath={`url(#dp_${el.id})`}>
        {grid && <g stroke="#d5dae1" strokeWidth={0.6}>{grid.xs.map((t) => <line key={`gx${t.px}`} x1={t.px} y1={0} x2={t.px} y2={d.h} />)}{grid.ys.map((t) => <line key={`gy${t.px}`} x1={0} y1={t.px} x2={d.w} y2={t.px} />)}</g>}{/* #2301 */}
        {grid && (() => { /* #2738 — a white box behind each label, not a stroked halo (one text per label in the PDF) */
          const gf = Math.max(6, d.fontPx - 1), cap = gridCaption ? `Grid ${grid.spacing.toLocaleString("en-US")} m, ${gridCaption}` : `Grid ${grid.spacing.toLocaleString("en-US")} m`;
          const boxed = (key, text, x, y, anchor = "start") => { const b = labelBackdrop(text, x, y, gf, anchor); return <g key={key}><rect x={b.x} y={b.y} width={b.w} height={b.h} fill="#ffffff" fillOpacity="0.85" /><text x={x} y={y} textAnchor={anchor}>{text}</text></g>; };
          return <g fontSize={gf} fill="#55606e" fontFamily={FONT}>
            {grid.xs.filter((t) => !(keyBox && keyBox.y < d.fontPx + 2 && t.px + 2 < keyBox.x + keyBox.w && t.px + 2 + t.label.length * d.fontPx * 0.5 > keyBox.x)).map((t) => { const p = gridLabelPlace(t, "x", gf, d.w, d.h); return boxed(`lx${t.px}`, t.label, p.x, p.y, p.anchor); })}
            {grid.ys.filter((t) => !(keyBox && keyBox.x < 2 + t.label.length * d.fontPx * 0.5 && t.px - d.fontPx < keyBox.y + keyBox.h && t.px > keyBox.y)).map((t) => { const p = gridLabelPlace(t, "y", gf, d.w, d.h); return boxed(`ly${t.px}`, t.label, p.x, p.y, p.anchor); })}{/* #2611 — not under the key; #3182 — inside the frame */}
            {boxed("cap", cap, d.w - GRID_INSET, d.h - GRID_INSET, "end")}
          </g>;
        })()}
        {d.holes.map((hh) => <line key={`t${hh.id}`} x1={hh.ax} y1={hh.ay} x2={hh.bx} y2={hh.by} stroke={styles.get(hh.id).hollow ? INK : styles.get(hh.id).colour} strokeWidth={line} strokeLinecap="round" />)}
        {/* #2473 — a hole with no value is a hollow ring; higher grade classes are drawn last, on top */}
        {d.holes.filter((hh) => hh.inside).sort((a, b) => styles.get(a.id).rMm - styles.get(b.id).rMm).map((hh) => { const s = styles.get(hh.id), r = rOf(s), path = symbolPath(d.shapes.shapeOf(hh.id), hh.ax, hh.ay, r); /* #2686; r: #3017 */ const hollowFill = dense.halo ? "#ffffff" : "none"; return path
          ? <path key={`c${hh.id}`} d={path} fill={s.hollow ? hollowFill : s.colour} stroke={s.hollow ? s.colour : dense.halo ? "#ffffff" : "none"} strokeWidth={s.hollow ? 0.9 : 0.6} />
          : s.hollow
          ? <circle key={`c${hh.id}`} cx={hh.ax} cy={hh.ay} r={r} fill={hollowFill} stroke={s.colour} strokeWidth={0.9} />
          : <circle key={`c${hh.id}`} cx={hh.ax} cy={hh.ay} r={r} fill={s.colour} stroke={dense.halo ? "#ffffff" : "none"} strokeWidth={0.6} />; })}
        {d.labels.placed.map((l) => { const b = labelBackdrop(l.id, l.x, l.y, d.fontPx, l.anchor); return <g key={`l${l.id}`}><rect x={b.x} y={b.y} width={b.w} height={b.h} fill="#ffffff" fillOpacity="0.85" /><text x={l.x} y={l.y} textAnchor={l.anchor} fontSize={d.fontPx} fill={INK} fontFamily={FONT}>{l.id}</text></g>; })}{/* #2738 — boxed, not haloed */}
      </g>
      {keyBox && (
        <g transform={`translate(${keyBox.x},${keyBox.y})`}>
          <rect x="0" y="0" width={keyBox.w} height={keyBox.h} fill="rgba(255,255,255,0.9)" stroke="#c9ced4" />
          {keyBox.lines.map((t, i) => <text key={`kt${i}`} x="8" y={8 + i * keyBox.row + d.fontPx - 1} fontSize={i ? d.fontPx - 1 : d.fontPx} fontWeight={i ? 400 : 600} fill={i ? "#55606e" : INK} fontFamily={FONT}>{t}</text>)}
          {colouring.key.map((k, i) => (
            <g key={`k${i}`} transform={`translate(8,${8 + (keyBox.lines.length + i) * keyBox.row})`}>
              {k.note ? null /* #3026 — the '+ n more' line */ : k.hollow ? <circle cx="4" cy={d.fontPx / 2 - 1} r={k.rMm * MM} fill="#ffffff" stroke={k.colour} strokeWidth={0.9} /> : <circle cx="4" cy={d.fontPx / 2 - 1} r={k.rMm * MM} fill={k.colour} />}
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
