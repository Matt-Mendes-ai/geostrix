// TASKS.csv #1950 / #1951 (Vulcan workflow review) — a closed solid CLIPPED by a surface (the terrain, a contact, a fault) and the
// BOOLEANS of two closed solids (intersection, union, difference), from the exact mesh clippers the modelling runs already use
// (lib/crosscut.js: a host cut at its crossings with the other mesh, by bisection). Each result is assembled from the pieces of
// the inputs' own faces:
//   clip, keep one side:  the solid's faces on that side + the surface's faces inside the solid, wound to face away from the kept part
//   intersection A ∩ B:   A's faces inside B + B's faces inside A
//   union A ∪ B:          A's faces outside B + B's faces outside A
//   difference A − B:     A's faces outside B + B's faces inside A, reversed
// THE HONEST LIMITS: (1) the clipper cuts a triangle on its EDGES' crossings, so a corner or an edge of the other mesh that falls
// inside one triangle, away from its edges, is not cut into it (a box's corner inside a big flat triangle). Both meshes are
// therefore REFINED first (refineMesh: midpoint splits down to a fraction of the overlap's size, near the overlap only), which
// bounds that miss to slivers along the seam: the volumes below are exact to about a percent, not to the metre. (2) The two sides
// of a seam are each cut on the other mesh, at their own vertices, so the seam's two edge loops trace the same curve without
// sharing vertices: a closure check sees them as open edges, and that is reported (`closed`, `boundaryEdges`), never hidden. Pure.
import { truncateAgainstSolid, splitAcrossSurface, componentCount } from "./crosscut.js";
import { isMeshClosed } from "./meshQuery.js";
import { meshVolume } from "./unitVolumes.js";

// UNIFORM midpoint 4-splits of the whole mesh, round by round, until no triangle near `box` has an edge over maxEdge or the next
// round would pass `cap` triangles. Uniform rounds keep the mesh conforming (every edge is split on both its triangles), so a
// closed solid stays closed and the inside query stays exact; splitting near the box alone left T-junctions, which the closure
// check refused. Shared midpoints by edge key.
export function refineMesh(mesh, maxEdge, box = null, cap = 300000) {
  let verts = [];
  const P = mesh.positions;
  for (let i = 0; i < P.length; i += 3) verts.push([P[i], P[i + 1], P[i + 2]]);
  let tris = Array.from({ length: mesh.indices.length / 3 }, (_, t) => [mesh.indices[t * 3], mesh.indices[t * 3 + 1], mesh.indices[t * 3 + 2]]);
  const m2 = maxEdge * maxEdge;
  const d2 = (a, b) => { const A = verts[a], B = verts[b]; return (A[0] - B[0]) ** 2 + (A[1] - B[1]) ** 2 + (A[2] - B[2]) ** 2; };
  const near = ([a, b, c]) => { if (!box) return true; const A = verts[a], B = verts[b], C = verts[c]; return Math.max(A[0], B[0], C[0]) >= box.x0 && Math.min(A[0], B[0], C[0]) <= box.x1 && Math.max(A[1], B[1], C[1]) >= box.y0 && Math.min(A[1], B[1], C[1]) <= box.y1 && Math.max(A[2], B[2], C[2]) >= box.z0 && Math.min(A[2], B[2], C[2]) <= box.z1; };
  for (let round = 0; round < 12; round++) {
    const coarse = tris.some((t) => near(t) && Math.max(d2(t[0], t[1]), d2(t[1], t[2]), d2(t[2], t[0])) > m2);
    if (!coarse || tris.length * 4 > cap) break;
    const mids = new Map();
    const mid = (a, b) => { const k = a < b ? `${a}|${b}` : `${b}|${a}`; let m = mids.get(k); if (m === undefined) { const A = verts[a], B = verts[b]; m = verts.length; verts.push([(A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2]); mids.set(k, m); } return m; };
    const next = [];
    for (const [a, b, c] of tris) { const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a); next.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]); }
    tris = next;
  }
  return { positions: Float64Array.from(verts.flat()), indices: Uint32Array.from(tris.flat()) };
}
const overlapBox = (a, b, pad) => { const A = meshBounds(a.positions), B = meshBounds(b.positions); const o = { x0: Math.max(A.x0, B.x0) - pad, y0: Math.max(A.y0, B.y0) - pad, z0: Math.max(A.z0, B.z0) - pad, x1: Math.min(A.x1, B.x1) + pad, y1: Math.min(A.y1, B.y1) + pad, z1: Math.min(A.z1, B.z1) + pad }; return o.x1 >= o.x0 && o.y1 >= o.y0 && o.z1 >= o.z0 ? o : null; }; // a flat overlap (a plane through a box) counts
// the second mesh moved by a millimetre on each axis: two solids built on the same levels or the same outline share faces
// exactly (two extrusions from 659 to 799 m), and a vertex ON the other mesh has no side, so a coplanar cap was dropped whole
// (a third of the volume of the test prisms' intersection); a millimetre is far below any survey and breaks every coincidence
const NUDGE = 0.001;
const nudged = (m) => { const positions = Float64Array.from(m.positions); for (let i = 0; i < positions.length; i++) positions[i] += NUDGE; return { positions, indices: m.indices }; };
// both meshes refined over their overlap to a twentieth of its size (never finer than refineFloor m)
const refinePair = (a, b0, { divisions = 20, refineFloor = 0.25 } = {}) => {
  const b = nudged(b0);
  const o = overlapBox(a, b, 0);
  if (!o) return [a, b];
  const size = Math.max(o.x1 - o.x0, o.y1 - o.y0, o.z1 - o.z0), maxEdge = Math.max(refineFloor, size / divisions), pad = maxEdge * 2;
  const box = { x0: o.x0 - pad, y0: o.y0 - pad, z0: o.z0 - pad, x1: o.x1 + pad, y1: o.y1 + pad, z1: o.z1 + pad };
  return [refineMesh(a, maxEdge, box), refineMesh(b, maxEdge, box)];
};
const reversed = (indices) => { const out = new Uint32Array(indices.length); for (let t = 0; t < indices.length; t += 3) { out[t] = indices[t]; out[t + 1] = indices[t + 2]; out[t + 2] = indices[t + 1]; } return out; };
const concat = (parts) => {
  const nPos = parts.reduce((a, p) => a + p.positions.length, 0), nIdx = parts.reduce((a, p) => a + p.indices.length, 0);
  const positions = new Float64Array(nPos), indices = new Uint32Array(nIdx);
  let po = 0, io = 0;
  for (const p of parts) { positions.set(p.positions, po); const base = po / 3; for (let i = 0; i < p.indices.length; i++) indices[io + i] = p.indices[i] + base; po += p.positions.length; io += p.indices.length; }
  return { positions, indices };
};
const finish = (parts, extra = {}) => {
  const live = parts.filter((p) => p && p.indices && p.indices.length >= 3);
  if (!live.length) return { ok: true, empty: true, reason: "empty", ...extra };
  const m = concat(live), closure = isMeshClosed(m.positions, m.indices), signed = meshVolume(m.positions, m.indices);
  // a result wound inward (every piece reversed) is turned outward, so its volume and the inside query read right
  const indices = signed < 0 ? reversed(m.indices) : m.indices;
  return { ok: true, empty: false, positions: m.positions, indices, volumeM3: Math.abs(signed), closed: closure.closed, boundaryEdges: closure.boundaryEdges, components: componentCount(indices), ...extra };
};
// which way a surface faces, on average (+1 up, -1 down): "above" and "below" for the user
export function meanNormalZ(positions, indices) {
  const n = meanNormal(positions, indices);
  return n[2] > 1e-12 ? 1 : n[2] < -1e-12 ? -1 : 0;
}
// the area-weighted mean normal (not unit) and the vertex centroid
export function meanNormal(positions, indices) {
  const n = [0, 0, 0];
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3;
    const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2], vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
    n[0] += uy * vz - uz * vy; n[1] += uz * vx - ux * vz; n[2] += ux * vy - uy * vx;
  }
  return n;
}
const centroid = (positions) => { const c = [0, 0, 0], n = positions.length / 3; for (let i = 0; i < positions.length; i += 3) { c[0] += positions[i] / n; c[1] += positions[i + 1] / n; c[2] += positions[i + 2] / n; } return c; };

// the part of `solid` on one side of `surface`: keep "positive" (the side the surface faces) or "negative". -> finish() | { ok: false, reason }
export function clipSolidBySurface(solid0, surface0, { keep = "positive" } = {}) {
  const [solid, surface] = refinePair(solid0, surface0);
  const split = splitAcrossSurface(solid, surface, { pad: 1 });
  if (!split.ok) return { ok: false, reason: split.reason };
  if (split.reason === "no-overlap") {
    // the surface is nowhere near the solid: the whole solid is on one side of it, told by the surface's mean normal and the
    // two centroids (a far surface has one side for the whole solid)
    const n = meanNormal(surface.positions, surface.indices), cs = centroid(solid.positions), cf = centroid(surface.positions);
    const side = n[0] * (cs[0] - cf[0]) + n[1] * (cs[1] - cf[1]) + n[2] * (cs[2] - cf[2]) >= 0 ? "positive" : "negative";
    if (side !== keep) return { ok: true, empty: true, reason: "nothing-on-that-side" };
    return { ok: true, empty: false, unchanged: true, ...finish([{ positions: solid.positions, indices: solid.indices }]), reason: "no-overlap" };
  }
  const part = keep === "positive" ? split.positive : split.negative;
  if (!part.indices.length) return { ok: true, empty: true, reason: "nothing-on-that-side" };
  if (!split.changed) return { ok: true, empty: false, unchanged: true, ...finish([part]), reason: "one-sided" }; // wholly on the kept side: the solid as it was
  // the cap: the surface where it runs through the solid, facing away from the kept part
  const cap = truncateAgainstSolid(surface, solid, { keep: "inside" });
  const capPart = cap.ok && cap.indices?.length ? { positions: cap.positions, indices: keep === "positive" ? reversed(cap.indices) : cap.indices } : null;
  return finish([part, capPart], { unresolvedEdges: split.stats?.unresolvedEdges || 0, capTriangles: capPart ? Math.floor(capPart.indices.length / 3) : 0 });
}

// two closed solids combined. op: "intersection" | "union" | "difference" (a minus b). -> finish() | { ok: false, reason, closure? }
export function solidBoolean(a0, b0, op = "intersection") {
  const [a, b] = refinePair(a0, b0);
  const cut = (host, cutter, keep) => truncateAgainstSolid(host, cutter, { keep });
  const aIn = cut(a, b, "inside"), aOut = cut(a, b, "outside");
  if (!aIn.ok) return { ok: false, reason: aIn.reason, closure: aIn.closure };
  const bIn = cut(b, a, "inside"), bOut = cut(b, a, "outside");
  if (!bIn.ok) return { ok: false, reason: bIn.reason, closure: bIn.closure };
  const apart = aIn.reason === "no-overlap";
  const piece = (r) => (r.changed ? { positions: r.positions, indices: r.indices } : null);
  const whole = (m) => ({ positions: m.positions, indices: m.indices });
  if (apart) {
    if (op === "intersection") return { ok: true, empty: true, reason: "apart" };
    if (op === "union") return finish([whole(a), whole(b)], { reason: "apart" });
    return finish([whole(a)], { reason: "apart" });
  }
  // truncateAgainstSolid reports "nothing-inside" (keep inside) when NO vertex was outside, i.e. the host is wholly inside the
  // cutter, and "no-intersection" (keep outside) when no vertex was inside, i.e. wholly outside; a host wholly on the dropped side
  // comes back changed with no triangles, which piece() passes on as an empty part
  const aInsideB = aIn.changed ? piece(aIn) : aIn.reason === "nothing-inside" ? whole(a) : null;
  const aOutsideB = aOut.changed ? piece(aOut) : aOut.reason === "no-intersection" ? whole(a) : null;
  const bInsideA = bIn.changed ? piece(bIn) : bIn.reason === "nothing-inside" ? whole(b) : null;
  const bOutsideA = bOut.changed ? piece(bOut) : bOut.reason === "no-intersection" ? whole(b) : null;
  if (op === "intersection") return finish([aInsideB, bInsideA]);
  if (op === "union") return finish([aOutsideB, bOutsideA]);
  return finish([aOutsideB, bInsideA ? { positions: bInsideA.positions, indices: reversed(bInsideA.indices) } : null]);
}

// a patch of the terrain as a mesh over a box, for a clip at the ground: a regular grid of up to `n` columns across the longer
// side, sampled through groundAt(x, y) (NaN where the terrain has no data), wound counter-clockwise seen from above (facing up,
// so "positive" is above the ground). bounds: { x0, y0, x1, y1 } padded by the caller. -> { positions, indices } | null
export function terrainPatchMesh(groundAt, bounds, n = 160) {
  const w = bounds.x1 - bounds.x0, h = bounds.y1 - bounds.y0;
  if (!(w > 0 && h > 0)) return null;
  const nx = Math.max(2, Math.round(w >= h ? n : (n * w) / h)), ny = Math.max(2, Math.round(w >= h ? (n * h) / w : n));
  const pos = new Float64Array(nx * ny * 3), ok = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = bounds.x0 + (w * i) / (nx - 1), y = bounds.y0 + (h * j) / (ny - 1), z = groundAt(x, y), k = j * nx + i;
    pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = Number.isFinite(z) ? z : 0; ok[k] = Number.isFinite(z) ? 1 : 0;
  }
  const idx = [];
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
    if (ok[a] && ok[b] && ok[d]) idx.push(a, b, d);
    if (ok[a] && ok[d] && ok[c]) idx.push(a, d, c);
  }
  return idx.length ? { positions: pos, indices: Uint32Array.from(idx), sampled: nx * ny, missing: nx * ny - ok.reduce((s, v) => s + v, 0) } : null;
}

export const meshBounds = (positions, pad = 0) => {
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (let i = 0; i < positions.length; i += 3) { const x = positions[i], y = positions[i + 1], z = positions[i + 2]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z; }
  return { x0: x0 - pad, y0: y0 - pad, z0: z0 - pad, x1: x1 + pad, y1: y1 + pad, z1: z1 + pad };
};
