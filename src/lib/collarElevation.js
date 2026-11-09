// TASKS.csv #2169 (WA review #2148) — a collar with x / y and a blank elevation was skipped (#337: a blank RL used to put it at sea
// level). On the WA composite that dropped 16,630 of 51,253 collars, and every interval, assay and log on them. They are kept now, at an
// ASSUMED elevation that says where it came from (zAssumed), flagged in Data QC:
//   "terrain" — the loaded terrain at the collar (the best guess for a surface hole),
//   "median"  — the median elevation of the other collars (this file's and the project's),
//   "zero"    — 0 m, when there is nothing else.
// A hole already in the project with an elevation keeps it: its row goes on with z = NaN, which the collar merge never writes
// over a value (layers.js mergeCollar).
import { quantileSorted } from "./arrayStats.js";

// rows: collar rows after reprojection (project CRS); existing: the project's collars; groundAt(x, y) -> elevation or NaN.
// -> { rows, counts: { terrain, median, zero, kept }, medianZ }
export function fillMissingCollarZ(rows, { existing = [], groundAt = null } = {}) {
  const counts = { terrain: 0, median: 0, zero: 0, kept: 0 };
  const known = new Map();
  for (const c of existing || []) if (Number.isFinite(c?.z)) known.set(c.hole_id, c.z);
  const zs = [...(rows || []).map((r) => r.z), ...known.values()].filter(Number.isFinite).sort((a, b) => a - b);
  const medianZ = zs.length ? quantileSorted(zs, 0.5) : null;
  const out = (rows || []).map((r) => {
    if (Number.isFinite(r.z)) return r;
    if (known.has(r.hole_id)) { counts.kept++; return r; }
    const g = groundAt ? groundAt(r.x, r.y) : NaN;
    if (Number.isFinite(g)) { counts.terrain++; return { ...r, z: g, zAssumed: "terrain" }; }
    if (medianZ != null) { counts.median++; return { ...r, z: medianZ, zAssumed: "median" }; }
    counts.zero++;
    return { ...r, z: 0, zAssumed: "zero" };
  });
  return { rows: out, counts, medianZ };
}

// a merged collar whose elevation now comes from the file (a real value) is no longer assumed
export function settleAssumedZ(merged, incoming) {
  if (merged?.zAssumed && !incoming?.zAssumed && Number.isFinite(incoming?.z) && merged.z === incoming.z) {
    const { zAssumed, ...rest } = merged;
    return rest;
  }
  return merged;
}
