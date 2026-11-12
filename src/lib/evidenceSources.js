// TASKS.csv #1154 — evidence a drilling project already holds, for the evidence overlay (Matt: "can't add evidence"; the
// list only offered value rasters, map layers and surface samples, so a project of holes and a terrain had an empty list).
// Geophysics survey points, block models (column by column), grades along the holes and distance to logged structures.
// Pure: no React, no three.js.
import { desurveyHole, pointOnTrace } from "./desurvey.js";
import { voxelCellSupported } from "./viewer/geomath.js";
import { surveyKey } from "./geophysSurveys.js";
import { valueIn } from "./geochem.js";
import { modelGround } from "./modelGround.js"; // TASKS.csv #2447
import { median } from "./arrayStats.js"; // TASKS.csv #2447
import { drillSiteSpacing } from "./drillSpacing.js"; // TASKS.csv #2949
import { drilledCollars } from "./collarStatus.js"; // TASKS.csv #2949

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

// TASKS.csv #2447 / #2576 (reviews #2325 / #2486) — where a plan-view score map goes: draped on the terrain; with none, on the collar
// surface (the collars of surface drilling are on the ground: #1353, #2470), the viewer drawing it under the holes; collars that look
// underground (#2217) are no ground, and the map stays flat under the drilling (#1204). -> { drapeMode, elevation?, kind }
// elevation, on the collar surface: the collars' median, for a reader of the flat level (an export, a project whose collars go)
// voxelModels: TASKS.csv #1837 (review #1646, Kodiak) — with no terrain and no holes the sheet lay at the scene origin (about 1,275 m), inside
// the IP model it was computed from: it now sits just above the highest block model's top ("above"), and every notice names the elevation
export function scoreRasterPlacement(terrain, collars, survey, traces, voxelModels = []) {
  if (terrain) return { drapeMode: "terrain", kind: "terrain" };
  const g = modelGround(null, collars, survey);
  if (g.ground) return { drapeMode: "collars", kind: "collars", elevation: Math.round(median((collars || []).map((c) => c?.z))) };
  const z = rasterFloorZ(traces);
  if (z != null) return { drapeMode: "flat", kind: "floor", elevation: z };
  let top = -Infinity;
  for (const m of voxelModels || []) for (const c of m?.cells || []) { const t = c.z + (c.dz || 0) / 2; if (Number.isFinite(t) && t > top) top = t; }
  if (Number.isFinite(top)) return { drapeMode: "flat", kind: "above", elevation: Math.ceil(top + 10) };
  return { drapeMode: "flat", kind: "flat" };
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
// TASKS.csv #2326 (review #2174, WA gold) — a Level (RL from / to): on a deposit drilled from underground every hole-based card projected
// all depths onto one plan. level = { zMin, zMax } (either may be null; null / both null = every depth) -> is elevation z inside it
export const inLevel = (z, level) => !level || ((level.zMin == null || z >= level.zMin) && (level.zMax == null || z <= level.zMax));
export const levelSet = (level) => !!level && (level.zMin != null || level.zMax != null);
// lowest: #2578 — a card favourable when LOW (K/Rb, a depletion) maps each bin's lowest value, not its highest
export function holeGradePoints(assays, symbol, unit, units, traces, bin = GRADE_BIN_M, level = null, lowest = false) {
  const best = new Map();
  for (const a of assays || []) {
    const t = traces.get(a.hole_id), from = Number(a.from), to = Number(a.to);
    if (!t || !Number.isFinite(from) || !Number.isFinite(to)) continue;
    const v = valueIn(a, symbol, unit, units);
    if (v == null) continue;
    const p = pointOnTrace(t, (from + to) / 2);
    if (!inLevel(p.z, level)) continue; // #2326
    const key = `${Math.floor(p.x / bin)},${Math.floor(p.y / bin)}`, was = best.get(key);
    if (!was || (lowest ? v < was.value : v > was.value)) best.set(key, { x: p.x, y: p.y, z: p.z, value: v }); // z: #2326 (the target's elevation)
  }
  return [...best.values()];
}

// TASKS.csv #2643 — how deep each hole was tested: one point per hole at its deepest sample (the largest 'to' of its assays, any element),
// valued at that point's elevation. Between the holes it is high where the drilling stopped shallow, so a card 'favourable when high'
// asks for ground not tested at depth (a hole that was not sampled deep must not rank below one that was).
export function depthTestedPoints(assays, traces) {
  const deep = new Map();
  for (const a of assays || []) {
    const to = Number(a.to);
    if (!traces.has(a.hole_id) || !Number.isFinite(to)) continue;
    if (!(deep.get(a.hole_id) >= to)) deep.set(a.hole_id, to);
  }
  return [...deep].map(([h, d]) => { const p = pointOnTrace(traces.get(h), d); return { x: p.x, y: p.y, z: p.z, value: p.z, hole_id: h, depth: d }; }).filter((p) => Number.isFinite(p.value));
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
// TASKS.csv #1456 (review #1352) — every hole trace in plan, for "distance to drilling": with it an overlay can ask for ground that is
// anomalous AND untested. A vertical hole is its collar point; an angled one the line its trace makes on the map.
export function drilledParts(traces) {
  const out = [];
  for (const t of traces?.values?.() || []) if (t?.length) out.push(t.map((p) => [p.x, p.y]));
  return out;
}

export function structureParts(rows, code, traces, level = null) {
  const out = [];
  for (const r of rows || []) {
    if (String(r.value ?? "").trim() !== code) continue;
    const t = traces.get(r.hole_id), d = Number(r.depth);
    if (!t || !Number.isFinite(d)) continue;
    const p = pointOnTrace(t, d);
    if (!inLevel(p.z, level)) continue; // #2326
    out.push([[p.x, p.y]]);
  }
  return out;
}

// TASKS.csv #1179 — the default "no influence" distance of a structure logged in core. The median over every grid cell only says how big the
// grid is: 8.3 km on Woodjam, whose grid follows a 25 km block model. A fault in a hole reaches a few hole spacings at most.
export const pickDefaultReachM = (medianOverGrid, collarSpacingM) => (collarSpacingM > 0 ? Math.min(medianOverGrid, Math.round(3 * collarSpacingM)) : medianOverGrid);

// TASKS.csv #1451 — collars on one pad are one drill site: on Silvertip's three pads neighbouring collars are 1-3 m apart, so the
// collar spacing (1.3 m) made "distance to a logged structure" favourable only within 4 m. Collars within a pad of a site join it;
// the median distance from each site to the next is the spacing. collars: [{ x, y }] -> metres, or null with fewer than 2 sites.
// TASKS.csv #2949 (review #2876, WA iron) — this compared every site with every other (2.8-4.7 s at 6,390 collars, on every open of
// Evidence overlay and Undrilled zones and on each distance card), and its fixed 25 m pad joined the holes of a 23 m pattern into sites of
// 2-7 holes ('typically 27 m apart'). It is now lib/drillSpacing.js's grid-hashed drillSiteSpacing with the pad following the drilling
// (#2545's idea): a tenth of the spacing a 25 m pad gives, kept between 3 and 25 m, and below the median nearest-collar distance when the
// collars are not on pads (that distance 3 m or more), so a pad's collars 1-3 m apart still merge and a regular pattern does not. With no
// padM it is kept per collars array (the panes remount on every open).
const siteSpacingMemo = new WeakMap();
export function medianSiteSpacing(collars, padM = null) {
  const auto = !(padM > 0) && Array.isArray(collars);
  if (auto && siteSpacingMemo.has(collars)) return siteSpacingMemo.get(collars);
  const pts = (collars || []).filter((c) => Number.isFinite(c?.x) && Number.isFinite(c?.y));
  let pad = padM;
  if (!(pad > 0)) {
    const opts = { minBuffer: 0, maxBuffer: Infinity };
    const coarse = drillSiteSpacing(pts, { ...opts, siteM: 25 }), nearest = drillSiteSpacing(pts, { ...opts, siteM: 0.01 });
    pad = coarse ? Math.min(25, Math.max(3, coarse.spacing / 10)) : 25;
    if (nearest && nearest.spacing >= 3) pad = Math.min(pad, 0.9 * nearest.spacing); // a 3-5 m grid is not one pad
  }
  let out = drillSiteSpacing(pts, { siteM: pad, minBuffer: 0, maxBuffer: Infinity })?.spacing ?? null;
  if (out == null) {
    // drillSiteSpacing needs 3 sites: two (or one) by hand
    const sites = [];
    for (const c of pts) if (!sites.some((q) => Math.hypot(q.x - c.x, q.y - c.y) <= pad)) sites.push(c);
    out = sites.length === 2 ? Math.hypot(sites[0].x - sites[1].x, sites[0].y - sites[1].y) : null;
  }
  if (auto) siteSpacingMemo.set(collars, out);
  return out;
}

// The site spacing of the drilled collars (#2097: a collar marked proposed is not drilled ground), kept per store collars array so a pane's
// remount does not measure again (#2949)
const drilledSpacingMemo = new WeakMap();
export function drilledSiteSpacing(collars) {
  if (!Array.isArray(collars)) return null;
  if (!drilledSpacingMemo.has(collars)) drilledSpacingMemo.set(collars, medianSiteSpacing(drilledCollars(collars).collars));
  return drilledSpacingMemo.get(collars);
}

// TASKS.csv #1728 (review #1645, Copley) — the porphyry vectors a drilling project logs can be evidence too: a numeric downhole layer
// (mag susc, SG, RQD) or a numeric field of a custom layer (SWIR white-mica wavelength, chalcopyrite %) "along the holes" like a grade,
// and a logged interval zone (a structural zone, an alteration code) as a "distance to". A row is an interval (from / to) or a point
// (depth); both are placed on the hole trace.
const ROW_KEYS = new Set(["hole_id", "from", "to", "depth", "_src", "id"]);
// the fields of these rows with at least `min` finite numbers (a text code field is not one)
// TASKS.csv #2049 (review #2013, 3D Modelling) — Woodjam's alteration intensity is stored as text ('1'..'5'), so the halo's 'Only where'
// floor offered logged_tstamp (an Excel date), iteration and rank but not the intensity. A number written as text counts (when nearly every
// filled value of the field is one), bookkeeping fields (time stamps, dates, iterations, ranks, ids) are left out, and an intensity field
// comes first.
const BOOKKEEPING_FIELD = /(^|[_\s-])(t?stamp|timestamp|date|time|iteration|iter|rank|objectid|object_?id|uuid|fid|id|year|version|row)$|^_/i;
export const numericCell = (v) => (typeof v === "number" ? (Number.isFinite(v) ? v : null) : typeof v === "string" && /^\s*[-+]?\d+(\.\d+)?\s*$/.test(v) ? Number(v) : null);
export function numericLayerFields(rows, { min = 5 } = {}) {
  const counts = new Map(), filled = new Map();
  for (const r of rows || []) for (const k of Object.keys(r)) {
    if (ROW_KEYS.has(k) || BOOKKEEPING_FIELD.test(k)) continue;
    const v = r[k];
    if (v == null || v === "") continue;
    filled.set(k, (filled.get(k) || 0) + 1);
    if (numericCell(v) != null) counts.set(k, (counts.get(k) || 0) + 1);
  }
  const keys = [...counts].filter(([k, n]) => n >= min && n >= 0.9 * filled.get(k)).map(([k]) => k);
  return keys.sort((a, b) => (/intensity|^int$|_int(_|$)/i.test(b) ? 1 : 0) - (/intensity|^int$|_int(_|$)/i.test(a) ? 1 : 0));
}
// TASKS.csv #2260 (review #2174, WA lode gold) — a field that measures how wrong another is (a spectral fit's TSA_Error, a standard
// deviation, a residual) is never favourability: it is left out of the evidence list
export const UNCERTAINTY_FIELD = /(^|[_\s-])(err|error|errors|uncert|uncertainty|stdev|std_?dev|sd|mse|rmse|residual|resid)$/i;
// and a numeric field that holds a few whole numbers (a weathering class 1-6) may be a code, not a measure: -> { values } (sorted) or null
export function codeLikeField(rows, field, { maxCodes = 8, min = 5 } = {}) {
  const seen = new Set();
  let n = 0;
  for (const r of rows || []) {
    const v = numericCell(r?.[field]);
    if (v == null) continue;
    if (!Number.isInteger(v)) return null;
    n++; seen.add(v);
    if (seen.size > maxCodes) return null;
  }
  return n >= min && seen.size >= 2 ? { values: [...seen].sort((x, y) => x - y) } : null;
}
const rowDepth = (r) => { const from = Number(r.from), to = Number(r.to); if (Number.isFinite(from) && Number.isFinite(to)) return (from + to) / 2; const d = Number(r.depth); return Number.isFinite(d) ? d : NaN; };
// one point per 25 m plan bin, the highest value in it (as holeGradePoints)
export function layerFieldPoints(rows, field, traces, bin = GRADE_BIN_M, level = null) {
  const best = new Map();
  for (const r of rows || []) {
    const t = traces.get(r.hole_id), d = rowDepth(r), v = numericCell(r[field]); // #2049 — a number written as text too
    if (!t || !Number.isFinite(d) || v == null) continue;
    const p = pointOnTrace(t, d);
    if (!inLevel(p.z, level)) continue; // #2326
    const key = `${Math.floor(p.x / bin)},${Math.floor(p.y / bin)}`, was = best.get(key);
    if (!was || v > was.value) best.set(key, { x: p.x, y: p.y, z: p.z, value: v });
  }
  return [...best.values()];
}
// TASKS.csv #2453 / #2583 — a row's code in a field, trimmed; upper-cased when folding case
export const codeOf = (r, field = "value", fold = false) => { const s = String(r?.[field] ?? "").trim(); return fold ? s.toUpperCase() : s; };
// TASKS.csv #2102 (review #2013, Woodjam) — a logged list ('Py; Cpy', 'Cpy, Py') is each of its codes: a row belongs to every mineral it names,
// so 'distance to logged chalcopyrite' is one card, not four; an import's fill for a blank ('Unknown', 'n/a', '?', '-') is no code at all
const NO_CODE = /^(unknown|unk|n\/?a|\?|-+)$/i;
export const codesOf = (r, field = "value", fold = false) => { const out = []; for (const t of String(r?.[field] ?? "").split(/\s*[;,+]\s*/)) { const s = t.trim(); if (s && !NO_CODE.test(s)) out.push(fold ? s.toUpperCase() : s); } return out; };
// the TEXT fields of logged rows that hold codes: mostly not numbers, at least `min` rows, and no more than `maxCodes` distinct values
// (a free-text description is not a code field). "value" first when it is one.
const FREE_TEXT_FIELD = /^(desc|description|comments?|notes?|remarks?|log|geologist|logged_?by)$/i;
export function codedFields(rows, { min = 3, maxCodes = 60 } = {}) {
  const seen = new Map();
  for (const r of rows || []) for (const k of Object.keys(r)) {
    if ((ROW_KEYS.has(k) && k !== "value") || k === "value_num" || BOOKKEEPING_FIELD.test(k) || FREE_TEXT_FIELD.test(k)) continue;
    const v = r[k];
    if (v == null || v === "" || typeof v === "object") continue;
    let s = seen.get(k); if (!s) { s = { n: 0, num: 0, codes: new Set() }; seen.set(k, s); }
    s.n++; if (numericCell(v) != null) s.num++; else if (s.codes.size <= maxCodes) s.codes.add(String(v).trim().toUpperCase());
  }
  return [...seen].filter(([, s]) => s.n >= min && s.num < 0.5 * s.n && s.codes.size >= 1 && s.codes.size <= maxCodes).map(([k]) => k)
    .sort((a, b) => (b === "value" ? 1 : 0) - (a === "value" ? 1 : 0));
}
// the codes of a field folded by case, each with its spellings: [{ key (upper case), label ("P" or "P / p"), n, variants }], at least `min`
// rows on a hole. A field whose codes differ only by case is read as one code per letter-string (#2583: 'p' beside 'P', 'qv' beside 'QV').
export function foldedCodes(rows, traces, { min = 1, field = "value" } = {}) {
  const by = new Map();
  for (const r of rows || []) {
    if (!traces.has(r.hole_id) || !Number.isFinite(rowDepth(r))) continue;
    for (const s of new Set(codesOf(r, field))) { // #2102 — every code of a list, once per row
      const k = s.toUpperCase(); let e = by.get(k); if (!e) { e = { key: k, n: 0, spell: new Map() }; by.set(k, e); }
      e.n++; e.spell.set(s, (e.spell.get(s) || 0) + 1);
    }
  }
  return [...by.values()].filter((e) => e.n >= min).map((e) => { const v = [...e.spell].sort((a, b) => b[1] - a[1]).map(([s]) => s); return { key: e.key, label: v.join(" / "), n: e.n, variants: v }; })
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}
// TASKS.csv #2453 (review #2325, WA uranium) — the per-hole measures a flat, stratabound target is explored with, from one logged code:
// how = "thick": the metres logged with the code in each hole (0 in a hole that logged this field without it), at the middle of those
// intervals (or the hole's first logged depth); "top": the depth of the first interval with the code, at its top; "baseZ": the elevation of
// the base of the deepest interval with the code. Downhole metres: true thickness only in a hole drilled across the unit (vertical holes in
// flat ground). -> [{ x, y, z, value }]
export function zoneHolePoints(rows, code, traces, how = "thick", { field = "value", fold = false, level = null } = {}) {
  const per = new Map();
  for (const r of rows || []) {
    const t = traces.get(r.hole_id), from = Number(r.from), to = Number(r.to);
    if (!t || !Number.isFinite(from) || !Number.isFinite(to)) continue;
    const list = codesOf(r, field, fold); // #2102
    if (!list.length) continue;
    let h = per.get(r.hole_id); if (!h) { h = { t, thick: 0, top: Infinity, base: -Infinity, first: Infinity, lo: Infinity, hi: -Infinity }; per.set(r.hole_id, h); }
    const a = Math.min(from, to), b = Math.max(from, to);
    if (a < h.first) h.first = a;
    if (!list.includes(code)) continue;
    h.thick += b - a; if (a < h.top) h.top = a; if (b > h.base) h.base = b; if (a < h.lo) h.lo = a; if (b > h.hi) h.hi = b;
  }
  const out = [];
  for (const h of per.values()) {
    const has = h.thick > 0;
    if (how !== "thick" && !has) continue; // no top / base where the hole did not log the code: unknown, not zero
    const d = how === "top" ? h.top : how === "baseZ" ? h.base : has ? (h.lo + h.hi) / 2 : h.first;
    const p = pointOnTrace(h.t, d);
    if (!inLevel(p.z, level)) continue;
    out.push({ x: p.x, y: p.y, z: p.z, value: how === "top" ? h.top : how === "baseZ" ? p.z : h.thick });
  }
  return out;
}
// the codes of interval rows (from / to) or point rows (depth) that sit on a hole, with at least `min` of them
// (TASKS.csv #1455: every coded log - lithology, alteration, veins, breccia, mineralization, structural zones - not only the zones)
export function zoneCodes(rows, traces, { min = 1 } = {}) {
  const counts = new Map();
  for (const r of rows || []) {
    const code = String(r.value ?? "").trim();
    if (code && traces.has(r.hole_id) && Number.isFinite(rowDepth(r))) counts.set(code, (counts.get(code) || 0) + 1);
  }
  return [...counts].filter(([, n]) => n >= min).map(([k]) => k).sort();
}
// the intervals of one code as distanceEvidence parts: a polyline along the trace from `from` to `to`, a vertex every `stepM`
// field / fold: TASKS.csv #2453 / #2583 — another coded field of the rows (a lithology row's strat, a custom layer's Rock2), and codes
// matched without regard to case ('p' and 'P' are one code; `code` is then the upper-case key)
export function zoneParts(rows, code, traces, stepM = 5, level = null, { field = "value", fold = false } = {}) {
  const out = [];
  for (const r of rows || []) {
    if (!codesOf(r, field, fold).includes(code)) continue; // #2102 — a row listing the code
    const t = traces.get(r.hole_id), from = Number(r.from), to = Number(r.to);
    if (!t) continue;
    if (!Number.isFinite(from) || !Number.isFinite(to)) { const d = Number(r.depth); if (Number.isFinite(d)) { const p = pointOnTrace(t, d); if (inLevel(p.z, level)) out.push([[p.x, p.y]]); } continue; } // a point row (#1455); level: #2326
    const a = Math.min(from, to), b = Math.max(from, to), pts = [];
    for (let d = a; d <= b + 1e-9; d += stepM) pts.push(pointOnTrace(t, Math.min(d, b)));
    if (pts.length === 1 || Math.abs((b - a) % stepM) > 1e-9) pts.push(pointOnTrace(t, b));
    // #2326 — only the stretches inside the level, each its own part
    let part = [];
    for (const p of pts) { if (inLevel(p.z, level)) part.push([p.x, p.y]); else if (part.length) { out.push(part); part = []; } }
    if (part.length) out.push(part);
  }
  return out;
}

// TASKS.csv #2326 — the target's elevation for a top cell: the highest value among the points of a hole-based point card (grades, pXRF, a
// numeric log) that make the cell's value (within the card's reach: pointEvidence's inverse-distance points) and lie inside the level; else
// the level's middle when one is set; else null (typed in Planned holes). The cell's own column was tried first (half a cell, then one 25 m
// grade bin): the top cells of a plateau sat 50 m and more from any point (found live, WA gold).
// cards: [{ pts: [{ x, y, z, value }], reach }] (or plain point arrays) in card order -> { z, from: "point" | "level", within } | null
export function targetElevation(cell, cardPoints, grid, level = null, bin = GRADE_BIN_M) {
  const r0 = Math.max(grid?.dx || 0, grid?.dy || 0, bin);
  // TASKS.csv #2579 (review #2486) — the best point within the card's whole reach (250 m) gave a target 50-74 m off in RL on a sheet dipping
  // 35 degrees: its E / N and its RL came from places 200 m apart. Now the best point within two cells of the target (its own ground), else
  // the inverse-distance-squared mean RL of the points the card reaches; `dist` is the plan distance to the point used.
  const near = 2 * r0;
  for (const card of cardPoints || []) {
    const pts = Array.isArray(card) ? card : card?.pts, r = Array.isArray(card) ? r0 : Math.max(r0, card?.reach || 0);
    let best = null, bestD = 0, sw = 0, sz = 0, n = 0;
    for (const p of pts || []) {
      if (!Number.isFinite(p.z) || !inLevel(p.z, level)) continue;
      const d = Math.hypot(p.x - cell.x, p.y - cell.y);
      if (d > r) continue;
      if (d <= near && (!best || p.value > best.value)) { best = p; bestD = d; }
      const w = 1 / Math.max(1, d) ** 2; sw += w; sz += w * p.z; n++;
    }
    if (best) return { z: best.z, from: "point", within: Math.min(near, r), dist: bestD };
    if (n) return { z: sz / sw, from: "mean", within: r, n };
  }
  if (level && level.zMin != null && level.zMax != null) return { z: (level.zMin + level.zMax) / 2, from: "level" };
  return null;
}

// TASKS.csv #2577 (review #2486) — a grade card read every hole: 30 m aircore that stopped in the regolith scored as tested and barren
// beside the RC that cut the sheet at 40-190 m. The card can take one set of holes (a collar field, as the hole list picks them), and says
// what it read. ids: a Set of hole ids, or null for every hole
export const assaysOfHoles = (assays, ids) => (ids ? (assays || []).filter((a) => ids.has(a.hole_id)) : assays || []);
export function gradeCardReads(assays, symbol, unit, units) {
  const holes = new Set();
  let from = Infinity, to = -Infinity;
  for (const a of assays || []) {
    if (valueIn(a, symbol, unit, units) == null) continue;
    holes.add(a.hole_id);
    const f = Number(a.from), t = Number(a.to);
    if (Number.isFinite(f) && f < from) from = f;
    if (Number.isFinite(t) && t > to) to = t;
  }
  return { holes: holes.size, from: Number.isFinite(from) ? from : null, to: Number.isFinite(to) ? to : null };
}

// TASKS.csv #2453 / #2583 — a card on a coded field other than a built-in log's value, or on a code with several spellings, or a per-hole
// measure of a code: its ref is "@" + JSON { l: layer key or "custom:<id>", f: field, c: code (upper case when fold), fold, how? }.
// The plain "layer:code" ref of a built-in log's value code keeps its old form, so a saved overlay still finds its cards.
export const codedRef = (o) => `@${JSON.stringify(o)}`;
export const parseCodedRef = (ref) => { if (typeof ref !== "string" || ref[0] !== "@") return null; try { return JSON.parse(ref.slice(1)); } catch { return null; } };
export const codedRowsOf = (l, projectLayers, customLayers) => (String(l).startsWith("custom:") ? (customLayers || []).find((c) => String(c.id) === String(l).slice(7))?.rows || [] : projectLayers?.[l] || []);

// TASKS.csv #2653 (follow-up of #2453) — a per-hole measure of a grade as evidence: the hole's grade x thickness (GT) or its metres at or
// above a cut-off, from Best intercepts' rules (lib/geochem.js computeBestIntercepts, summed per hole by #2419's accumulation.js holeTotals),
// placed at the intercepts' length-weighted centre; a hole assayed for the element with no intercept is a 0 at its assayed mid-depth (drilled,
// nothing at the cut-off). The cut-off is the user's, carried in the card's ref: "gt:{symbol}:{gt|m}:{cutoff}".
export const gtRef = (symbol, how, cutoff) => `gt:${symbol}:${how}:${cutoff}`;
export const parseGtRef = (ref) => { const m = /^gt:([^:]+):(gt|m):(.+)$/.exec(String(ref || "")); return m && Number.isFinite(Number(m[3])) ? { symbol: m[1], how: m[2], cutoff: Number(m[3]) } : null; };
export function holeIntervalPoints(assays, symbol, unit, units, traces, { how, cutoff, computeBestIntercepts, holeTotals, maxInternalDilution = 2, minLength = 0 }) {
  const rows = computeBestIntercepts(assays, symbol, unit, units, { cutoff, maxInternalDilution, minLength });
  const totals = holeTotals(rows, (h, md) => { const t = traces.get(h); return t ? pointOnTrace(t, md) : null; });
  const out = [], seen = new Set();
  for (const t of totals) {
    if (!Number.isFinite(t.x) || !Number.isFinite(t.y)) continue;
    seen.add(t.hole_id);
    out.push({ x: t.x, y: t.y, z: null, value: how === "m" ? t.thicknessM : t.gt, hole_id: t.hole_id });
  }
  const span = new Map();
  for (const a of assays || []) {
    if (seen.has(a.hole_id) || !traces.has(a.hole_id) || valueIn(a, symbol, unit, units) == null) continue;
    const f = Number(a.from), to = Number(a.to); if (!(to > f)) continue;
    const s = span.get(a.hole_id) || [Infinity, -Infinity]; span.set(a.hole_id, [Math.min(s[0], f), Math.max(s[1], to)]);
  }
  for (const [h, [f, to]] of span) { const p = pointOnTrace(traces.get(h), (f + to) / 2); if (p) out.push({ x: p.x, y: p.y, z: p.z, value: 0, hole_id: h }); }
  return out;
}

// TASKS.csv #2654 (follow-up of #2453) — the add-evidence list ran to 241 entries on the WA uranium sample: grouped by what the evidence comes
// from, and narrowed by a search (every word of the query in the label, any order, case ignored). Group names are English keys for tr().
const SOURCE_GROUP = { raster: "Rasters", distance: "Map layers", element: "Surface samples", index: "Surface samples", survey: "Geophysics", voxel: "Block models", solid: "Modelled bodies", grade: "Drillholes: grades", pxrf: "Drillholes: grades", gtpick: "Drillholes: grades", numeric: "Drillholes: logs and measures", zone: "Drillholes: logged codes", pick: "Drillholes: structures", drilled: "Drilling", kde: "Known occurrences" };
export const sourceGroup = (src) => SOURCE_GROUP[src?.kind] || "Other";
export function filterSources(sources, query) {
  const words = String(query || "").toLowerCase().split(/\s+/).filter(Boolean);
  return words.length ? (sources || []).filter((s) => { const l = String(s.label || "").toLowerCase(); return words.every((w) => l.includes(w)); }) : sources || [];
}
// -> [[group, [sources]]] in the order the groups first appear
export function groupSources(sources) {
  const m = new Map();
  for (const s of sources || []) { const g = sourceGroup(s); (m.get(g) || m.set(g, []).get(g)).push(s); }
  return [...m];
}

// TASKS.csv #2655 (follow-up of #2583, review #2486 WA lithium) — a custom layer's numeric field that belongs to a coded sibling (GEOL_Rock2_pct
// is the percent of the GEOL_Rock2 rock): the field read only where the sibling holds one code ("GEOL_Rock2_pct where GEOL_Rock2 = P").
// A sibling is a coded field whose name the numeric field starts with (after _ or a space). -> [{ field, by, codes: [code] }]
export function siblingCodedFields(rows, { maxCodes = 12 } = {}) {
  const coded = codedFields(rows), numeric = numericLayerFields(rows);
  const out = [];
  for (const f of numeric) for (const c of coded) {
    if (f === c || !(f.toLowerCase().startsWith(c.toLowerCase() + "_") || f.toLowerCase().startsWith(c.toLowerCase() + " "))) continue;
    const n = new Map();
    for (const r of rows || []) { const v = String(r?.[c] ?? "").trim(); if (v && numericCell(r?.[f]) != null) n.set(v.toUpperCase(), (n.get(v.toUpperCase()) || 0) + 1); }
    const codes = [...n].filter(([, k]) => k >= 3).sort((a, b) => b[1] - a[1]).slice(0, maxCodes).map(([code]) => code).sort();
    if (codes.length) out.push({ field: f, by: c, codes });
  }
  return out;
}
export const siblingRef = (id, field, by, code) => `cw:${JSON.stringify({ id: String(id), f: field, c: by, v: code })}`;
export const parseSiblingRef = (ref) => { if (typeof ref !== "string" || !ref.startsWith("cw:")) return null; try { return JSON.parse(ref.slice(3)); } catch { return null; } };
// the rows of the sibling's code (case folded)
export const siblingRows = (rows, s) => (rows || []).filter((r) => String(r?.[s.c] ?? "").trim().toUpperCase() === String(s.v).toUpperCase());

// TASKS.csv #2656 (follow-up of #2583) — a "distance to logged" card reads only the holes that logged the layer: a hole with no log of it is
// neither near nor far from the code. -> { none, total } (holes with a trace; none: those with no row of the layer)
export function unloggedHoles(rows, traces) {
  const logged = new Set();
  for (const r of rows || []) if (traces.has(r?.hole_id)) logged.add(r.hole_id);
  return { none: traces.size - logged.size, total: traces.size };
}
// the occurrence element: the first grade card's element when it is one of the offered list, else the list's first (#2656)
export function occurrenceSymbol(layers, list, current = null) {
  const syms = (list || []).map((e) => e.symbol);
  const card = (layers || []).find((l) => l.kind === "grade" && syms.includes(l.ref));
  if (card) return card.ref;
  return syms.includes(current) ? current : syms[0] || "";
}

// TASKS.csv #2781 (follow-up of #2653) — the same per-hole grade x thickness / metres above a cut-off for a numeric downhole log (the gamma
// log's eU3O8, a custom layer's field): its rows as assay-shaped intervals { hole_id, from, to, values: { v } }; a point log (depth only)
// becomes intervals from each reading to the next in its hole, the last one as long as the hole's median step. Then holeIntervalPoints.
export const gtlRef = (ref, how, cutoff) => `gtl:${JSON.stringify({ r: ref, how, c: cutoff })}`;
export const parseGtlRef = (ref) => { if (typeof ref !== "string" || !ref.startsWith("gtl:")) return null; try { const z = JSON.parse(ref.slice(4)); return z && (z.how === "gt" || z.how === "m") && Number.isFinite(Number(z.c)) ? { ref: z.r, how: z.how, cutoff: Number(z.c) } : null; } catch { return null; } };
export function logIntervals(rows, field) {
  const out = [], points = new Map();
  for (const r of rows || []) {
    const v = numericCell(r?.[field]); if (v == null) continue;
    const f = Number(r.from), t = Number(r.to);
    if (Number.isFinite(f) && Number.isFinite(t) && t > f) { out.push({ hole_id: r.hole_id, from: f, to: t, values: { v } }); continue; }
    const d = Number(r.depth); if (Number.isFinite(d)) (points.get(r.hole_id) || points.set(r.hole_id, []).get(r.hole_id)).push([d, v]);
  }
  for (const [h, list] of points) {
    list.sort((a, b) => a[0] - b[0]);
    const steps = list.slice(1).map((p, i) => p[0] - list[i][0]).filter((x) => x > 0).sort((a, b) => a - b), step = steps.length ? steps[steps.length >> 1] : 0;
    list.forEach(([d, v], i) => { const to = i + 1 < list.length ? list[i + 1][0] : d + step; if (to > d) out.push({ hole_id: h, from: d, to, values: { v } }); });
  }
  return out;
}
