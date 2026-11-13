import { suspectElevationIds } from "../collarElevationTrust.js"; // TASKS.csv #3004

// TASKS.csv #1782 (review #1646, Kodiak) — the elevations a level plan can be cut at: the loaded holes' traces, and with no holes the
// visible block models (a level plan is also the tool that cuts a model at an RL: the contractor's IP depth slices). Was holes only, so
// a project with no collars refused the tool. Loops, not Math.min(...) over every vertex (#371). -> [z0, z1] or null
export function levelPlanZRange(traces, voxelModels) {
  let z0 = Infinity, z1 = -Infinity;
  for (const t of mainTraces(traces, (t) => t.wz?.[0])) for (const z of t.wz || []) { if (z < z0) z0 = z; if (z > z1) z1 = z; } // #2936 — not a stray collar's
  if (Number.isFinite(z0)) return [z0, z1];
  for (const m of voxelModels || []) {
    if (m.visible === false) continue;
    for (const c of m.cells || []) { if (!Number.isFinite(c.value)) continue; const h = (c.dz || 0) / 2; if (c.z - h < z0) z0 = c.z - h; if (c.z + h > z1) z1 = c.z + h; }
  }
  return Number.isFinite(z0) && z1 > z0 ? [z0, z1] : null;
}

// TASKS.csv #2936 (WA iron review) — two collars at elevation 0 among 6,388 at 397-471 m set every vertical default: the Level plan's RL
// slider ran -60 to 472 m and the horizontal 3D slice opened at 181-231 m where no hole is. A small group of collars cut off from the rest
// by a wide elevation gap is left out of the default ranges: the widest gap between sorted collar elevations, when it is over
// max(100 m, 5 x the interquartile range) and the side beyond it is at most 1 % of the holes (and at most 20). Continuous relief (a
// mountain project) has no such gap, so nothing is dropped there. -> a Set of the dropped indices.
export function strayCollars(zs) {
  const idx = (zs || []).map((z, i) => [Number(z), i]).filter(([z]) => Number.isFinite(z)).sort((a, b) => a[0] - b[0]);
  const n = idx.length, out = new Set();
  if (n < 20) return out;
  const q = (f) => idx[Math.min(n - 1, Math.floor(f * (n - 1)))][0], iqr = q(0.75) - q(0.25);
  let gi = -1, gap = 0;
  for (let i = 1; i < n; i++) { const g = idx[i][0] - idx[i - 1][0]; if (g > gap) { gap = g; gi = i; } }
  if (gi < 0 || gap <= Math.max(100, 5 * iqr)) return out;
  const low = gi, high = n - gi, cap = Math.min(20, Math.floor(0.01 * n));
  if (low <= cap) for (let i = 0; i < gi; i++) out.add(idx[i][1]);
  else if (high <= cap) for (let i = gi; i < n; i++) out.add(idx[i][1]);
  return out;
}
// the traces without the suspect-elevation ones; collarZ(trace) -> its collar's real elevation (world, not scene: the 0 m test needs it).
// TASKS.csv #3004 — the shared rule (lib/collarElevationTrust.js): the gap test above, and a 0 m collar among collars 50 m or more from 0,
// which this gap test missed on a project of under 20 holes. (A function-level import cycle: collarElevationTrust imports strayCollars.)
export function mainTraces(traces, collarZ) {
  const ts = traces || [], key = (t, i) => t?.hole_id ?? `#${i}`;
  const drop = suspectElevationIds(ts.map((t, i) => ({ hole_id: key(t, i), z: Number(collarZ(t)), zAssumed: !!t?.zAssumed })));
  return drop.size ? ts.filter((t, i) => !drop.has(key(t, i))) : ts;
}
