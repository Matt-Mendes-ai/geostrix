// TASKS.csv #170 / #135 — the "Planned hole checks" panel's sums: the nearest existing hole to each planned trace, and the
// metres of trace inside each narrowed voxel model's target band. Moved out of ViewerModule for TASKS.csv #1039 (review
// #1016, performance #2): every keystroke in a planned hole's Name or Notes re-ran them, at 1-8 s on a large project
// (200 drilled holes x every planned point, and `cells.some` over ~100k in-band blocks per trace segment). Now:
//  - the drilled traces and the in-band blocks are each indexed ONCE (a hash grid), not per planned hole;
//  - the panel keys its memo on the holes' geometry (planGeometryKey), so name / notes edits cost nothing.
// Same answers as before: test/plannedHoleChecks1039.test.mjs compares them with the brute-force version.
import { desurveyHole } from "./desurvey.js";
import { voxelCellSupported } from "./viewer/geomath.js";
import { plannedTrace } from "./holePlanning.js";

// what a check depends on: everything about a planned hole except its name and notes
export function planGeometryKey(plannedHoles) {
  return JSON.stringify((plannedHoles || []).map(({ name: _n, notes: _o, ...g }) => g));
}

// the drilled traces, desurveyed as the 3D view draws them (#135): a hash grid of `cell` metres, plus each hole's
// points and bounding box for points farther away than the grid search reaches
export function drilledTraceIndex(collars, survey, desurveyMethod, cell = 25) {
  const byHole = new Map();
  for (const s of survey || []) if (!isNaN(s.depth)) (byHole.get(s.hole_id) || byHole.set(s.hole_id, []).get(s.hole_id)).push(s);
  const grid = new Map(), holes = [];
  for (const c of collars || []) {
    const pts = desurveyHole(c, byHole.get(c.hole_id) || [], desurveyMethod);
    if (!pts.length) continue;
    const bb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (const p of pts) {
      const k = `${Math.floor(p.x / cell)},${Math.floor(p.y / cell)},${Math.floor(p.z / cell)}`;
      (grid.get(k) || grid.set(k, []).get(k)).push({ x: p.x, y: p.y, z: p.z, hole_id: c.hole_id });
      bb[0] = Math.min(bb[0], p.x); bb[1] = Math.min(bb[1], p.y); bb[2] = Math.min(bb[2], p.z); bb[3] = Math.max(bb[3], p.x); bb[4] = Math.max(bb[4], p.y); bb[5] = Math.max(bb[5], p.z);
    }
    holes.push({ hole_id: c.hole_id, pts, bb });
  }
  return { grid, cell, holes, n: holes.length };
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
export const isTargetModel = (m) => Number.isFinite(m.threshold) && Number.isFinite(m.rangeMax) && (m.threshold > m.min || m.rangeMax < m.max);
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
  return { modelId: model.id, modelName: model.name, inside, cells: cells.length };
}

// -> [{ hole, nearestReal: { hole_id, distance } | null, targetHits: [{ modelId, modelName, metres }] }]
export function planChecks(plannedHoles, drilled, targets, traceOf = plannedTrace) {
  return (plannedHoles || []).map((hole) => {
    const pts = traceOf(hole); // dense (~3 m) desurveyed points
    if (!pts.length) return { hole, nearestReal: null, targetHits: [] };
    let nearestReal = null;
    if (drilled?.n) for (const p of pts) { const { best, hole: h } = nearestDrilled(drilled, p); if (h != null && (!nearestReal || best < nearestReal.distance)) nearestReal = { hole_id: h, distance: best }; }
    const targetHits = (targets || []).map((t) => {
      let metres = 0;
      for (let i = 1; i < pts.length; i++) {
        const mid = { x: (pts[i].x + pts[i - 1].x) / 2, y: (pts[i].y + pts[i - 1].y) / 2, z: (pts[i].z + pts[i - 1].z) / 2 };
        if (t.inside(mid)) metres += pts[i].md - pts[i - 1].md;
      }
      return { modelId: t.modelId, modelName: t.modelName, metres };
    }).filter((h) => h.metres > 0);
    return { hole, nearestReal, targetHits };
  });
}
