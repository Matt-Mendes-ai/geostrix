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

// TASKS.csv #1829 / #1561 (reviews #1646 Kodiak, #1497 Lawyers) — how far a SAMPLE's value reaches: `factor` x the median distance
// to its nearest neighbour, in tens of metres, 50 m to 5 km. The bounding-box spacing below is ten times too wide for a program of
// separate grids or outcrop clusters: Kodiak's soils (seven grids over 19 x 31 km, 48 m stations) reached 700 m, its rock chips
// 3,570 m, and 71 % of the cells scored over the IP model had no soil within 75 m. Up to 2,000 points are asked (every k-th),
// against all of them; coincident points (duplicates) are not neighbours.
export function reachFromNeighbours(points, factor = 2) {
  const pts = (points || []).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  const n = pts.length;
  if (n < 2) return 500;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; }
  const cell = Math.max(1, Math.sqrt(Math.max(1, (x1 - x0) * (y1 - y0)) / n)), key = (cx, cy) => `${cx},${cy}`, buckets = new Map();
  pts.forEach((p) => { const k = key(Math.floor(p.x / cell), Math.floor(p.y / cell)); (buckets.get(k) || buckets.set(k, []).get(k)).push(p); });
  const step = Math.max(1, Math.floor(n / 2000)), nn = [];
  for (let i = 0; i < n; i += step) {
    const p = pts[i], cx = Math.floor(p.x / cell), cy = Math.floor(p.y / cell);
    let best = Infinity;
    for (let ring = 1; ring <= 4 && !(best <= (ring - 1) * cell); ring++) {
      for (let dx = -ring; dx <= ring; dx++) for (let dy = -ring; dy <= ring; dy++) {
        if (ring > 1 && Math.abs(dx) < ring && Math.abs(dy) < ring) continue; // inner cells already searched
        for (const q of buckets.get(key(cx + dx, cy + dy)) || []) { const d = Math.hypot(q.x - p.x, q.y - p.y); if (d > 0 && d < best) best = d; }
      }
    }
    if (Number.isFinite(best)) nn.push(best);
  }
  if (!nn.length) return reachFromSpacing(pts, factor);
  nn.sort((a, b) => a - b);
  return Math.min(5000, Math.max(50, Math.round((factor * nn[nn.length >> 1]) / 10) * 10));
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
// TASKS.csv #1831 (review #1646, Kodiak) — { zMin, zMax }: only blocks whose centre lies in that elevation band (a 3D model as plan
// evidence at a chosen level, not 'the maximum down to the base of the mesh'); how "mean" averages the band. An air flag (a negative
// minimum that every negative value equals: UBC-GIF's -1, masked at import since #1659 but still in older projects) is not a value:
// 'lowest in each column' on Kodiak's chargeability was -1 everywhere.
export function airFlagOf(model) {
  let min = Infinity, neg = 0, atMin = 0;
  for (const c of model?.cells || []) { const v = c.value; if (!Number.isFinite(v)) continue; if (v < min) { min = v; atMin = 0; } if (v === min) atMin++; if (v < 0) neg++; }
  // as voxel.js maskAirCells: every negative at the minimum, or at least 90 % of them when the minimum fills 5 % of the cells (blocks
  // averaged with air before #1659 leave a few in between: Kodiak's saved chargeability, 19,824 at -1 and 439 from -0.75 to 0)
  let n = 0;
  for (const c of model?.cells || []) if (Number.isFinite(c.value)) n++;
  return min < 0 && (atMin === neg || (atMin >= 0.9 * neg && atMin >= 0.05 * n)) ? min : null;
}
export function voxelColumnEvidence(g, model, how = "max", { zMin = null, zMax = null } = {}) {
  if (how === "mean") return voxelColumnMean(g, model, { zMin, zMax });
  // TASKS.csv #1281 — a sentinel, not a finite test per write: 100,000 blocks over 64 grid cells each is millions of writes
  const high = how !== "min", empty = high ? -Infinity : Infinity, out = new Float32Array(g.nx * g.ny).fill(empty);
  const air = airFlagOf(model), lo = Number.isFinite(zMin) ? zMin : -Infinity, hi = Number.isFinite(zMax) ? zMax : Infinity;
  for (const c of model?.cells || []) {
    if (!Number.isFinite(c.value) || c.value === air || !(c.z >= lo && c.z <= hi) || !voxelCellSupported(model, c)) continue;
    let i0 = Math.ceil((c.x - c.dx / 2 - g.x0) / g.dx), i1 = Math.floor((c.x + c.dx / 2 - g.x0) / g.dx);
    let j0 = Math.ceil((g.yTop - c.y - c.dy / 2) / g.dy), j1 = Math.floor((g.yTop - c.y + c.dy / 2) / g.dy);
    if (i1 < i0) i0 = i1 = Math.round((c.x - g.x0) / g.dx);
    if (j1 < j0) j0 = j1 = Math.round((g.yTop - c.y) / g.dy);
    for (let j = Math.max(0, j0); j <= Math.min(g.ny - 1, j1); j++) {
      for (let i = Math.max(0, i0); i <= Math.min(g.nx - 1, i1); i++) {
        const k = j * g.nx + i;
        if (high ? c.value > out[k] : c.value < out[k]) out[k] = c.value;
      }
    }
  }
  for (let k = 0; k < out.length; k++) if (out[k] === empty) out[k] = NaN;
  return out;
}
// #1831 — the mean of the blocks over each grid cell within the band (each block counted once per cell it covers)
function voxelColumnMean(g, model, { zMin, zMax }) {
  const sum = new Float64Array(g.nx * g.ny), cnt = new Uint32Array(g.nx * g.ny), out = new Float32Array(g.nx * g.ny).fill(NaN);
  const air = airFlagOf(model), lo = Number.isFinite(zMin) ? zMin : -Infinity, hi = Number.isFinite(zMax) ? zMax : Infinity;
  for (const c of model?.cells || []) {
    if (!Number.isFinite(c.value) || c.value === air || !(c.z >= lo && c.z <= hi) || !voxelCellSupported(model, c)) continue;
    let i0 = Math.ceil((c.x - c.dx / 2 - g.x0) / g.dx), i1 = Math.floor((c.x + c.dx / 2 - g.x0) / g.dx);
    let j0 = Math.ceil((g.yTop - c.y - c.dy / 2) / g.dy), j1 = Math.floor((g.yTop - c.y + c.dy / 2) / g.dy);
    if (i1 < i0) i0 = i1 = Math.round((c.x - g.x0) / g.dx);
    if (j1 < j0) j0 = j1 = Math.round((g.yTop - c.y) / g.dy);
    for (let j = Math.max(0, j0); j <= Math.min(g.ny - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(g.nx - 1, i1); i++) { const k = j * g.nx + i; sum[k] += c.value; cnt[k]++; }
  }
  for (let k = 0; k < out.length; k++) if (cnt[k]) out[k] = sum[k] / cnt[k];
  return out;
}
// #1831 — a model's elevation range (block centres), for the band's placeholders
export function voxelZRange(model) {
  let z0 = Infinity, z1 = -Infinity;
  for (const c of model?.cells || []) if (Number.isFinite(c.z)) { if (c.z < z0) z0 = c.z; if (c.z > z1) z1 = c.z; }
  return z1 >= z0 ? [z0, z1] : null;
}

// hole_id -> desurveyed trace
// TASKS.csv #1204 — the round elevation just under the deepest point of the drilling, for a raster with no terrain to drape on: the holes stay in view from above. traces: holeTraces' Map.
export function rasterFloorZ(traces) {
  let low = Infinity;
  for (const t of traces.values()) for (const p of t) if (p.z < low) low = p.z;
  return Number.isFinite(low) ? Math.floor(low / 10) * 10 - 10 : null;
}

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

// TASKS.csv #1723 (review #1645, Copley) — the elements that have at least one value in these rows: once pXRF is kept out of the
// drill grades (#1673), the pXRF-only elements (Br, Cl, Ir, Rh on Copley) must not be offered as "X grade along the holes".
export function elementsWithValues(assays, elements, units) {
  return (elements || []).filter((e) => (assays || []).some((a) => valueIn(a, e.symbol, units[e.symbol] || "ppm", units) != null));
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

// TASKS.csv #1451 — collars on one pad are one drill site: on Silvertip's three pads neighbouring collars are 1-3 m apart, so the
// collar spacing (1.3 m) made "distance to a logged structure" favourable only within 4 m. Collars within `padM` of a site join it;
// the median distance from each site to the next is the spacing. collars: [{ x, y }] -> metres, or null with fewer than 2 sites.
export function medianSiteSpacing(collars, padM = 25) {
  const sites = [];
  for (const c of collars || []) {
    if (!Number.isFinite(c?.x) || !Number.isFinite(c?.y)) continue;
    const s = sites.find((q) => Math.hypot(q.x - c.x, q.y - c.y) <= padM);
    if (s) { s.n++; s.x += (c.x - s.x) / s.n; s.y += (c.y - s.y) / s.n; } else sites.push({ x: c.x, y: c.y, n: 1 });
  }
  if (sites.length < 2) return null;
  const nn = sites.map((a) => Math.min(...sites.filter((b) => b !== a).map((b) => Math.hypot(a.x - b.x, a.y - b.y)))).sort((a, b) => a - b);
  return nn[nn.length >> 1];
}

// TASKS.csv #1728 (review #1645, Copley) — the porphyry vectors a drilling project logs can be evidence too: a numeric downhole layer
// (mag susc, SG, RQD) or a numeric field of a custom layer (SWIR white-mica wavelength, chalcopyrite %) "along the holes" like a grade,
// and a logged interval zone (a structural zone, an alteration code) as a "distance to". A row is an interval (from / to) or a point
// (depth); both are placed on the hole trace.
const ROW_KEYS = new Set(["hole_id", "from", "to", "depth", "_src", "id"]);
// the fields of these rows with at least `min` finite numbers (a text code field is not one)
export function numericLayerFields(rows, { min = 5 } = {}) {
  const counts = new Map();
  for (const r of rows || []) for (const k of Object.keys(r)) { if (ROW_KEYS.has(k)) continue; const v = r[k]; if (typeof v === "number" && Number.isFinite(v)) counts.set(k, (counts.get(k) || 0) + 1); }
  return [...counts].filter(([, n]) => n >= min).map(([k]) => k);
}
const rowDepth = (r) => { const from = Number(r.from), to = Number(r.to); if (Number.isFinite(from) && Number.isFinite(to)) return (from + to) / 2; const d = Number(r.depth); return Number.isFinite(d) ? d : NaN; };
// one point per 25 m plan bin, the highest value in it (as holeGradePoints)
export function layerFieldPoints(rows, field, traces, bin = GRADE_BIN_M) {
  const best = new Map();
  for (const r of rows || []) {
    const t = traces.get(r.hole_id), d = rowDepth(r), v = r[field];
    if (!t || !Number.isFinite(d) || typeof v !== "number" || !Number.isFinite(v)) continue;
    const p = pointOnTrace(t, d), key = `${Math.floor(p.x / bin)},${Math.floor(p.y / bin)}`, was = best.get(key);
    if (!was || v > was.value) best.set(key, { x: p.x, y: p.y, value: v });
  }
  return [...best.values()];
}
// the codes of interval rows (from / to) that sit on a hole, with their interval count
export function zoneCodes(rows, traces) {
  const counts = new Map();
  for (const r of rows || []) {
    const code = String(r.value ?? "").trim();
    if (code && traces.has(r.hole_id) && Number.isFinite(Number(r.from)) && Number.isFinite(Number(r.to))) counts.set(code, (counts.get(code) || 0) + 1);
  }
  return [...counts.keys()].sort();
}
// the intervals of one code as distanceEvidence parts: a polyline along the trace from `from` to `to`, a vertex every `stepM`
export function zoneParts(rows, code, traces, stepM = 5) {
  const out = [];
  for (const r of rows || []) {
    if (String(r.value ?? "").trim() !== code) continue;
    const t = traces.get(r.hole_id), from = Number(r.from), to = Number(r.to);
    if (!t || !Number.isFinite(from) || !Number.isFinite(to)) continue;
    const a = Math.min(from, to), b = Math.max(from, to), part = [];
    for (let d = a; d <= b + 1e-9; d += stepM) { const p = pointOnTrace(t, Math.min(d, b)); part.push([p.x, p.y]); }
    if (part.length === 1 || Math.abs((b - a) % stepM) > 1e-9) { const p = pointOnTrace(t, b); part.push([p.x, p.y]); }
    out.push(part);
  }
  return out;
}
