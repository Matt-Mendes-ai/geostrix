// TASKS.csv #1154 — evidence a drilling project already holds, for the evidence overlay (Matt: "can't add evidence"; the
// list only offered value rasters, map layers and surface samples, so a project of holes and a terrain had an empty list).
// Geophysics survey points, block models (column by column), grades along the holes and distance to logged structures.
// Pure: no React, no three.js.
import { desurveyHole, pointOnTrace } from "./desurvey.js";
import { voxelCellSupported } from "./viewer/geomath.js";
import { surveyKey } from "./geophysSurveys.js";
import { valueIn } from "./geochem.js";

export const DRILL_REACH_M = 250;
const GRADE_BIN_M = 25;

// the surveys in the geophysics points that have a value
export function surveyNames(rows) {
  const out = new Set();
  for (const r of rows || []) if (Number.isFinite(r.value)) out.add(surveyKey(r));
  return [...out];
}
export function surveyPoints(rows, key) {
  const out = [];
  for (const r of rows || []) if (surveyKey(r) === key && Number.isFinite(r.value) && Number.isFinite(r.x) && Number.isFinite(r.y)) out.push({ x: r.x, y: r.y, value: r.value });
  return out;
}

// How far a point's value reaches: `factor` x the mean spacing, in tens of metres, 50 m to 5 km. Stations along lines are
// far closer than the lines are apart, so a survey takes a larger factor than a soil grid to bridge its lines.
export function reachFromSpacing(points, factor = 1.5) {
  let n = 0, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of points || []) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    n++;
    if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
  }
  if (n < 2) return 500;
  return Math.min(5000, Math.max(50, Math.round((factor * Math.sqrt(((x1 - x0) * (y1 - y0)) / n)) / 10) * 10));
}

// A block model seen from above: in each grid cell, the highest (or lowest) value of the blocks over it, whatever their
// depth. A block smaller than the grid cell still marks the cell it falls in. Blocks the data cannot see are left out.
export function voxelColumnEvidence(g, model, how = "max") {
  const out = new Float32Array(g.nx * g.ny).fill(NaN), high = how !== "min";
  for (const c of model?.cells || []) {
    if (!Number.isFinite(c.value) || !voxelCellSupported(model, c)) continue;
    let i0 = Math.ceil((c.x - c.dx / 2 - g.x0) / g.dx), i1 = Math.floor((c.x + c.dx / 2 - g.x0) / g.dx);
    let j0 = Math.ceil((g.yTop - c.y - c.dy / 2) / g.dy), j1 = Math.floor((g.yTop - c.y + c.dy / 2) / g.dy);
    if (i1 < i0) i0 = i1 = Math.round((c.x - g.x0) / g.dx);
    if (j1 < j0) j0 = j1 = Math.round((g.yTop - c.y) / g.dy);
    for (let j = Math.max(0, j0); j <= Math.min(g.ny - 1, j1); j++) {
      for (let i = Math.max(0, i0); i <= Math.min(g.nx - 1, i1); i++) {
        const k = j * g.nx + i, v = out[k];
        if (!Number.isFinite(v) || (high ? c.value > v : c.value < v)) out[k] = c.value;
      }
    }
  }
  return out;
}

// hole_id -> desurveyed trace
export function holeTraces(collars, survey, method) {
  const by = new Map(), out = new Map();
  (survey || []).forEach((s) => { (by.get(s.hole_id) || by.set(s.hole_id, []).get(s.hole_id)).push(s); });
  for (const c of collars || []) {
    if (![c.x, c.y, c.z].every(Number.isFinite)) continue;
    const t = desurveyHole(c, by.get(c.hole_id) || [], method);
    if (t.length) out.set(c.hole_id, t);
  }
  return out;
}

// Grades placed where they are along the holes, not at the collars: holes fanned from one pad would otherwise all sit on
// one spot. A bin keeps its highest interval, so a narrow intercept is not averaged away by the samples either side.
export function holeGradePoints(assays, symbol, unit, units, traces, bin = GRADE_BIN_M) {
  const best = new Map();
  for (const a of assays || []) {
    const t = traces.get(a.hole_id), from = Number(a.from), to = Number(a.to);
    if (!t || !Number.isFinite(from) || !Number.isFinite(to)) continue;
    const v = valueIn(a, symbol, unit, units);
    if (v == null) continue;
    const p = pointOnTrace(t, (from + to) / 2), key = `${Math.floor(p.x / bin)},${Math.floor(p.y / bin)}`, was = best.get(key);
    if (!was || v > was.value) best.set(key, { x: p.x, y: p.y, value: v });
  }
  return [...best.values()];
}

// the structure types logged, with how many picks have a place on a hole
export function structureCodes(rows, traces) {
  const counts = new Map();
  for (const r of rows || []) {
    const code = String(r.value ?? "").trim();
    if (code && traces.has(r.hole_id) && Number.isFinite(Number(r.depth))) counts.set(code, (counts.get(code) || 0) + 1);
  }
  return [...counts.keys()].sort();
}
// the picks of one type as distanceEvidence parts (each a single point)
export function structureParts(rows, code, traces) {
  const out = [];
  for (const r of rows || []) {
    if (String(r.value ?? "").trim() !== code) continue;
    const t = traces.get(r.hole_id), d = Number(r.depth);
    if (!t || !Number.isFinite(d)) continue;
    const p = pointOnTrace(t, d);
    out.push([[p.x, p.y]]);
  }
  return out;
}

// TASKS.csv #1179 — the default "no influence" distance of a structure logged in core. The median over every grid cell only says how big the
// grid is: 8.3 km on Woodjam, whose grid follows a 25 km block model. A fault in a hole reaches a few hole spacings at most.
export const pickDefaultReachM = (medianOverGrid, collarSpacingM) => (collarSpacingM > 0 ? Math.min(medianOverGrid, Math.round(3 * collarSpacingM)) : medianOverGrid);
