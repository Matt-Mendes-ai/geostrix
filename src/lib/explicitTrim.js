// TASKS.csv #861 / #957 — an explicit surface trimmed at a fault: the fitted mesh cut by the fault's mesh and only the chosen
// side kept. Pure, so it runs in explicitSurface.worker.js after the fit (#957: it ran on the UI thread, 0.2-1.8 s of
// frozen view on every rebuild of a fault-bounded surface) and in the no-worker fallback alike.
import { splitAcrossSurface } from "./crosscut.js";
import { buildMeshQuery, closestPointOnMesh } from "./meshQuery.js";
import { t as tr } from "./i18n.js";

// The fault's mean normal, vertical component (world coordinates): which side is the hanging wall (the panel labels it).
export function faultNormalZ(w) {
  let nx = 0, ny = 0, nz = 0;
  const P = w.positions, I = w.indices;
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    const e1x = P[b] - P[a], e1y = P[b + 1] - P[a + 1], e1z = P[b + 2] - P[a + 2], e2x = P[c] - P[a], e2y = P[c + 1] - P[a + 1], e2z = P[c + 2] - P[a + 2];
    nx += e1y * e2z - e1z * e2y; ny += e1z * e2x - e1x * e2z; nz += e1x * e2y - e1y * e2x;
  }
  return nz / (Math.hypot(nx, ny, nz) || 1);
}

// TASKS.csv #941 — the inputs of a fault-bounded surface that lie on the side of the fault that is cut away. They were
// fitted with the rest, bent the kept surface towards them (37.9 m at the fault in the review's case: two mis-assigned
// footwall picks) and were then trimmed off without a word. Same side test as splitAcrossSurface (the nearest fault
// triangle's normal); a point within `onTolM` of the fault counts as on it, and a point beside the fault's extent (its
// nearest fault point is on the fault's edge, not straight across) has no side and is kept, as the trim keeps it.
// -> { keep, off } (input points, in order)
export function inputsBySide(points, fault, side, onTolM = 0.5) {
  const q = buildMeshQuery(fault.positions, fault.indices);
  if (!q) return { keep: points, off: [] };
  const P = fault.positions, I = fault.indices, keep = [], off = [];
  for (const p of points) {
    const near = closestPointOnMesh(q, p);
    if (!near || near.distance <= onTolM) { keep.push(p); continue; }
    const t = near.triangle, a = I[t * 3] * 3, b = I[t * 3 + 1] * 3, c = I[t * 3 + 2] * 3;
    const e1 = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], e2 = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]], nl = Math.hypot(...n) || 1;
    const s = (n[0] * (p.x - near.point.x) + n[1] * (p.y - near.point.y) + n[2] * (p.z - near.point.z)) / nl;
    if (Math.abs(s) < 0.99 * near.distance) { keep.push(p); continue; } // beside the fault, not across it
    ((s >= 0 ? 1 : -1) === side ? keep : off).push(p);
  }
  return { keep, off };
}

// The fit of a fault-bounded surface: inputs on the cut-away side left out (#941), then the fit, then the trim (#957).
// fit(points) -> fitExplicitSurface's result. res.trim.offSide: the inputs left out.
export function fitBoundedSurface(points, fit, fault, side) {
  const { keep, off } = inputsBySide(points, fault, side);
  if (off.length && keep.length < 3) throw new Error(tr("Only {k} of this surface's {n} inputs lie on the kept side of the fault: check the side chosen, or the fault.", { k: keep.length, n: points.length }));
  const res = trimAtFault(fit(off.length ? keep : points), fault, side);
  return { ...res, trim: { ...res.trim, offSide: off } };
}

// res: fitExplicitSurface's { positions, indices, ... } (world); fault: { positions, indices } (world); side: +1 / -1.
// Returns res with the kept part (only the vertices a triangle uses) and res.trim = { changed, unresolvedEdges, normalZ }.
export function trimAtFault(res, fault, side) {
  const sp = splitAcrossSurface({ positions: res.positions, indices: Array.from(res.indices) }, fault);
  const normalZ = faultNormalZ(fault);
  if (!sp.ok || !sp.changed) return { ...res, trim: { changed: false, unresolvedEdges: 0, normalZ } };
  const part = side > 0 ? sp.positive : sp.negative;
  const remap = new Int32Array(part.positions.length / 3).fill(-1), pos = [], idx = new Uint32Array(part.indices.length);
  for (let k = 0; k < part.indices.length; k++) { const v = part.indices[k]; if (remap[v] < 0) { remap[v] = pos.length / 3; pos.push(part.positions[3 * v], part.positions[3 * v + 1], part.positions[3 * v + 2]); } idx[k] = remap[v]; }
  return { ...res, positions: Float64Array.from(pos), indices: idx, trim: { changed: true, unresolvedEdges: sp.stats?.unresolvedEdges || 0, normalZ } };
}
