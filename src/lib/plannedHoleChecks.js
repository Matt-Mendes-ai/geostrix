// TASKS.csv #170 / #135 — the "Planned hole checks" panel's sums: the nearest existing hole to each planned trace, and the
// metres of trace inside each narrowed voxel model's target band. Moved out of ViewerModule for TASKS.csv #1039 (review
// #1016, performance #2): every keystroke in a planned hole's Name or Notes re-ran them, at 1-8 s on a large project
// (200 drilled holes x every planned point, and `cells.some` over ~100k in-band blocks per trace segment). Now:
//  - the drilled traces and the in-band blocks are each indexed ONCE (a hash grid), not per planned hole;
//  - the panel keys its memo on the holes' geometry (planGeometryKey), so name / notes edits cost nothing.
// Same answers as before: test/plannedHoleChecks1039.test.mjs compares them with the brute-force version.
import { desurveyHole, holeAttitudeAssumed } from "./desurvey.js"; // holeAttitudeAssumed: #2097
import { drilledCollars } from "./collarStatus.js"; // #2097
import { voxelCellSupported } from "./viewer/geomath.js";
import { plannedTrace } from "./holePlanning.js";
import { sortedShownValues } from "./voxelStretch.js"; // TASKS.csv #1832

// what a check depends on: everything about a planned hole except its name and notes
export function planGeometryKey(plannedHoles) {
  return JSON.stringify((plannedHoles || []).map(({ name: _n, notes: _o, ...g }) => g));
}

// the drilled traces, desurveyed as the 3D view draws them (#135): a hash grid of `cell` metres, plus each hole's
// points and bounding box for points farther away than the grid search reaches
// TASKS.csv #2097 — collars marked proposed are left out (proposed: their ids); a hole with no survey and no azimuth / dip is in, as the
// assumed vertical hole #2014 draws (assumed: their ids), so the checks can say so
// TASKS.csv #2977 — kept per collars array for its survey, method and cell: opening Planned holes desurveyed the 6,390 holes each time
const indexMemo = new WeakMap();
export function drilledTraceIndex(collars, survey, desurveyMethod, cell = 25) {
  const kept = Array.isArray(collars) ? indexMemo.get(collars) : null;
  if (kept && kept.survey === survey && kept.method === desurveyMethod && kept.cell === cell) return kept.out;
  const out = drilledTraceIndexOf(collars, survey, desurveyMethod, cell);
  if (Array.isArray(collars)) indexMemo.set(collars, { survey, method: desurveyMethod, cell, out });
  return out;
}
function drilledTraceIndexOf(collars, survey, desurveyMethod, cell) {
  const byHole = new Map();
  for (const s of survey || []) if (!isNaN(s.depth)) (byHole.get(s.hole_id) || byHole.set(s.hole_id, []).get(s.hole_id)).push(s);
  const grid = new Map(), holes = [], assumed = new Set();
  const { collars: drilled, proposed } = drilledCollars(collars);
  for (const c of drilled) {
    const hs = byHole.get(c.hole_id) || [];
    const pts = desurveyHole(c, hs, desurveyMethod);
    if (!pts.length) continue;
    if (holeAttitudeAssumed(c, hs)) assumed.add(c.hole_id);
    const bb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (const p of pts) {
      const k = `${Math.floor(p.x / cell)},${Math.floor(p.y / cell)},${Math.floor(p.z / cell)}`;
      (grid.get(k) || grid.set(k, []).get(k)).push({ x: p.x, y: p.y, z: p.z, hole_id: c.hole_id });
      bb[0] = Math.min(bb[0], p.x); bb[1] = Math.min(bb[1], p.y); bb[2] = Math.min(bb[2], p.z); bb[3] = Math.max(bb[3], p.x); bb[4] = Math.max(bb[4], p.y); bb[5] = Math.max(bb[5], p.z);
    }
    holes.push({ hole_id: c.hole_id, pts, bb });
  }
  return { grid, cell, holes, n: holes.length, assumed, proposed };
}
const RINGS = 3;
// the nearest drilled point to p: the grid cells within RINGS of p's cell (exact when the best is within RINGS cells),
// else every hole whose bounding box could hold something nearer
function nearestDrilled(index, p) {
  const { grid, cell } = index;
  const ci = Math.floor(p.x / cell), cj = Math.floor(p.y / cell), ck = Math.floor(p.z / cell);
  let best = Infinity, hole = null;
  for (let i = ci - RINGS; i <= ci + RINGS; i++) for (let j = cj - RINGS; j <= cj + RINGS; j++) for (let k = ck - RINGS; k <= ck + RINGS; k++) {
    const list = grid.get(`${i},${j},${k}`);
    if (list) for (const q of list) { const d = Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z); if (d < best) { best = d; hole = q.hole_id; } }
  }
  if (best <= RINGS * cell) return { best, hole }; // anything outside the searched block is at least RINGS cells away
  for (const h of index.holes) {
    const [x0, y0, z0, x1, y1, z1] = h.bb;
    const lb = Math.hypot(Math.max(x0 - p.x, 0, p.x - x1), Math.max(y0 - p.y, 0, p.y - y1), Math.max(z0 - p.z, 0, p.z - z1));
    if (lb >= best) continue;
    for (const q of h.pts) { const d = Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z); if (d < best) { best = d; hole = h.hole_id; } }
  }
  return { best, hole };
}

// Only voxel models the user has narrowed (threshold / rangeMax inside the model's own min / max) define a target band:
// an un-narrowed model spans its whole range, and scoring a hole against every cell would tell a geologist nothing.
// TASKS.csv #1832 (review #1646, Kodiak) — a cutoff that only hides the air / no-data cells (Kodiak's chargeability at -0.035 over
// -1 air, and a few hundred mixed cells between -0.75 and 0 from a reduction before air masking) is not a band: a range is one when
// it leaves out at least BAND_MIN_SHARE of the model's real (non-air) cells. -> the share of real cells outside [threshold, rangeMax]
export const BAND_MIN_SHARE = 0.02;
export function hiddenShare(m) {
  const s = sortedShownValues(m);
  if (!s || !s.length || !Number.isFinite(m.threshold) || !Number.isFinite(m.rangeMax)) return 0;
  const lower = (v) => { let lo = 0, hi = s.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (s[mid] < v) lo = mid + 1; else hi = mid; } return lo; };
  const upper = (v) => { let lo = 0, hi = s.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (s[mid] <= v) lo = mid + 1; else hi = mid; } return lo; };
  return (lower(m.threshold) + (s.length - upper(m.rangeMax))) / s.length;
}
export const isTargetModel = (m) => hiddenShare(m) >= BAND_MIN_SHARE;
// the band's range for a check line: "chargeability 10–23.1 mV/V"
export const targetBandText = (m) => {
  const f = (v) => String(+Number(v).toPrecision(3));
  const prop = m.property ? String(m.property).replace(/\s*\(([^)]*)\)\s*$/, "") : null, unit = m.property && /\(([^)]*)\)\s*$/.exec(m.property)?.[1];
  return `${prop ? `${prop.toLowerCase()} ` : ""}${f(m.threshold)}–${f(m.rangeMax)}${unit ? ` ${unit}` : ""}`;
};
// a narrowed model's in-band cells in a hash grid (bucket = the largest cell side, so a cell touches at most 8 buckets)
export function targetBandIndex(model) {
  const cells = (model.cells || []).filter((c) => c.value >= model.threshold && c.value <= model.rangeMax && voxelCellSupported(model, c));
  let size = 0;
  for (const c of cells) size = Math.max(size, c.dx, c.dy, c.dz);
  const grid = new Map(), b = size || 1;
  for (const c of cells) {
    const i0 = Math.floor((c.x - c.dx / 2) / b), i1 = Math.floor((c.x + c.dx / 2) / b);
    const j0 = Math.floor((c.y - c.dy / 2) / b), j1 = Math.floor((c.y + c.dy / 2) / b);
    const k0 = Math.floor((c.z - c.dz / 2) / b), k1 = Math.floor((c.z + c.dz / 2) / b);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++) { const key = `${i},${j},${k}`; (grid.get(key) || grid.set(key, []).get(key)).push(c); }
  }
  const inside = (m) => {
    const list = grid.get(`${Math.floor(m.x / b)},${Math.floor(m.y / b)},${Math.floor(m.z / b)}`);
    return !!list && list.some((c) => Math.abs(m.x - c.x) <= c.dx / 2 && Math.abs(m.y - c.y) <= c.dy / 2 && Math.abs(m.z - c.z) <= c.dz / 2);
  };
  return { modelId: model.id, modelName: model.name, band: targetBandText(model), inside, cells: cells.length }; // band: #1832
}

// TASKS.csv #1454 (review #1352, Silvertip) — a hole drilled from an existing pad was always "0.0 m from" its neighbour: the
// collars are metres apart by design. Drilled collars within PAD_M of the planned collar are reported as the same pad, and the
// first COLLAR_ZONE_M of the planned hole are then left out of the nearest-hole search; the depth where it comes closest is said.
export const PAD_M = 10, COLLAR_ZONE_M = 50;
// TASKS.csv #2976 — the checks' default minimum spacing: a quarter of the drilled holes' site spacing, to 0.1 m (none without one)
export const minSpacingFrom = (siteM) => (siteM > 0 ? Math.round((siteM / 4) * 10) / 10 : null);
// -> [{ hole, nearestReal: { hole_id, distance, md } | null, samePad: [hole_id], targetHits: [{ modelId, modelName, metres }] }]
// TASKS.csv #2977 — the nearest-hole part (the search of every drilled trace) kept per drilled index and planned-hole geometry: 1.4-2.1 s to
// open Planned holes with 19 planned holes, and again for every hole when one was added
const nearMemo = new WeakMap();
const holeGeomKey = (hole) => { const { name: _n, notes: _o, id: _i, ...g } = hole || {}; return JSON.stringify(g); };
export function planChecks(plannedHoles, drilled, targets, traceOf = plannedTrace) {
  let near = drilled && typeof drilled === "object" ? nearMemo.get(drilled) : null;
  if (drilled && typeof drilled === "object" && !near) { near = new Map(); nearMemo.set(drilled, near); }
  return (plannedHoles || []).map((hole) => {
    const pts = traceOf(hole); // dense (~3 m) desurveyed points
    if (!pts.length) return { hole, nearestReal: null, samePad: [], targetHits: [] };
    const gk = traceOf === plannedTrace && near ? holeGeomKey(hole) : null, hit = gk != null ? near.get(gk) : null;
    const { nearestReal, samePad } = hit || nearestOf(pts, drilled);
    if (gk != null && !hit) near.set(gk, { nearestReal, samePad });
    const targetHits = targetHitsOf(pts, targets);
    return { hole, nearestReal, samePad, targetHits };
  });
}
function nearestOf(pts, drilled) {
    let nearestReal = null;
    const c0 = pts[0], samePad = (drilled?.holes || []).filter((h) => h.pts[0] && Math.hypot(h.pts[0].x - c0.x, h.pts[0].y - c0.y, h.pts[0].z - c0.z) <= PAD_M).map((h) => h.hole_id);
    const skipMd = samePad.length ? COLLAR_ZONE_M : -Infinity;
    // TASKS.csv #2457 (5) — beside parallel holes the separation is the same all the way down, and "at 48 m down this hole" read as a closest
    // point: the spread of the distance to that hole along the trace says so (steady)
    const spread = new Map(); let counted = 0;
    if (drilled?.n) for (const p of pts) { if ((p.md ?? 0) < skipMd) continue; counted++; const { best, hole: h } = nearestDrilled(drilled, p); if (h != null) { const r = spread.get(h) || { lo: Infinity, hi: -Infinity, n: 0 }; r.lo = Math.min(r.lo, best); r.hi = Math.max(r.hi, best); r.n++; spread.set(h, r); } if (h != null && (!nearestReal || best < nearestReal.distance)) nearestReal = { hole_id: h, distance: best, md: p.md ?? 0, assumed: !!drilled.assumed?.has(h) }; } // assumed: #2097
    if (nearestReal) { const r = spread.get(nearestReal.hole_id); nearestReal.steady = !!r && r.n >= 0.8 * counted && r.hi - r.lo < 1; }
    return { nearestReal, samePad };
}
function targetHitsOf(pts, targets) {
    return (targets || []).map((t) => {
      let metres = 0;
      for (let i = 1; i < pts.length; i++) {
        const mid = { x: (pts[i].x + pts[i - 1].x) / 2, y: (pts[i].y + pts[i - 1].y) / 2, z: (pts[i].z + pts[i - 1].z) / 2 };
        if (t.inside(mid)) metres += pts[i].md - pts[i - 1].md;
      }
      return { modelId: t.modelId, modelName: t.modelName, band: t.band, metres };
    }).filter((h) => h.metres > 0);
}
