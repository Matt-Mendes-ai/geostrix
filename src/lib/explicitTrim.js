// TASKS.csv #861 / #957 — an explicit surface trimmed at a fault: the fitted mesh cut by the fault's mesh and only the chosen
// side kept. Pure, so it runs in explicitSurface.worker.js after the fit (#957: it ran on the UI thread, 0.2-1.8 s of
// frozen view on every rebuild of a fault-bounded surface) and in the no-worker fallback alike.
import { splitAcrossSurface } from "./crosscut.js";

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
