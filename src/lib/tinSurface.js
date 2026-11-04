// TASKS.csv #1958 (Vulcan workflow review) — a plain triangulation of measured points as they are: a pit or trench survey, spot
// heights, a DXF of points. Delaunay in plan (d3-delaunay), no fit, no smoothing, nothing beyond the points: a triangle with an
// edge longer than `maxEdgeFactor` times the median edge is left out (across a concave outline or between two survey areas it
// would invent ground nobody measured), and the count of those is reported. Triangles face up. Pure.
import { Delaunay } from "d3-delaunay";

// points: [{ x, y, z }] -> { positions (Float64Array, world E N Z), indices (Uint32Array), stats: { given, points, triangles, longDropped, maxEdgeM } } | null
export function tinSurface(points, { maxEdgeFactor = 10 } = {}) {
  const ok = (p) => p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
  const seen = new Set(), P = [];
  for (const p of points || []) { if (!ok(p)) continue; const k = `${Math.round(p.x * 100)},${Math.round(p.y * 100)}`; if (!seen.has(k)) { seen.add(k); P.push(p); } }
  if (P.length < 3) return null;
  const del = Delaunay.from(P, (p) => p.x, (p) => p.y), T = del.triangles;
  if (!T.length) return null;
  const edges = new Float64Array(T.length);
  for (let t = 0; t < T.length; t += 3) for (let k = 0; k < 3; k++) { const a = P[T[t + k]], b = P[T[t + ((k + 1) % 3)]]; edges[t + k] = Math.hypot(b.x - a.x, b.y - a.y); }
  const sorted = Float64Array.from(edges).sort(), maxEdge = maxEdgeFactor > 0 ? maxEdgeFactor * sorted[sorted.length >> 1] : Infinity;
  const idx = [];
  let dropped = 0;
  for (let t = 0; t < T.length; t += 3) {
    if (Math.max(edges[t], edges[t + 1], edges[t + 2]) > maxEdge) { dropped++; continue; }
    const a = T[t], b = T[t + 1], c = T[t + 2], A = P[a], B = P[b], C = P[c];
    const cross = (B.x - A.x) * (C.y - A.y) - (B.y - A.y) * (C.x - A.x); // twice the signed plan area
    if (Math.abs(cross) < 1e-9) continue; // points on a line make no triangle
    if (cross > 0) idx.push(a, b, c); else idx.push(a, c, b); // counter-clockwise seen from above faces up
  }
  if (!idx.length) return null;
  const positions = new Float64Array(P.length * 3);
  P.forEach((p, i) => { positions[i * 3] = p.x; positions[i * 3 + 1] = p.y; positions[i * 3 + 2] = p.z; });
  return { positions, indices: Uint32Array.from(idx), stats: { given: (points || []).length, points: P.length, triangles: idx.length / 3, longDropped: dropped, maxEdgeM: Number.isFinite(maxEdge) ? maxEdge : null } };
}
