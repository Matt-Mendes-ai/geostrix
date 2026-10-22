// TASKS.csv #811 — EXPLICIT surfaces: the geologist's picks are hard constraints, not data for an interpolation to
// weigh. Matt: "a tool specifically for explicit modelling. Where the user can pick contacts on a 3d view and or
// section and that will be the hard line of the modelled surface". Implicit modelling (#810) treats picks as
// inputs to a potential field that it may bend away from; here the surface passes EXACTLY through every pick and
// every drawn section line, and nothing else shapes it.
//
// explicitPoints(def, sections, { spacing, maxPoints }) -> { points, lines, sections, spacing }
//   def: { name, picks: [{ x, y, z }] (world E, N, elevation) }. Every drawn section contact tagged with def.name
//   (an upper contact) is a hard line: its vertices, plus points every `spacing` metres along each segment, so the
//   surface follows the whole line and not just its corners. The spacing grows if needed to stay under maxPoints.
// fitExplicitSurface(points, { margin, resolution, groundAt }) -> { positions, indices, n, frame, residualMax, ... }
//   1. frame: the best-fit plane of the points (PCA). Within 30° of horizontal the surface is a true height field
//      z = f(E, N); steeper, it is a height field over its own plane, so a steep or vertical contact works too
//      (a surface that folds back over its own plane cannot be one height field: re-pick it as two surfaces);
//   2. a thin-plate spline w = f(u, v) (Duchon 1977; r^2 log r plus a plane) solved EXACTLY through the points -
//      no nugget, no smoothing;
//   3. mesh: a regular grid over the points' extent plus `margin`, with every point inserted as a mesh vertex
//      (Delaunay in the plane), so the mesh honours each pick exactly, not just the spline between grid nodes;
//   4. optional cut at the ground: groundAt(E, N) -> elevation (NaN outside the terrain: nothing to cut there).
// Pure: no three.js, no React.
import { Delaunay } from "d3-delaunay";
import { clipMesh } from "./clipMesh.js";
import { t as tr } from "./i18n.js";

const dist3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

// extraLines (#817): further hard lines, [{ ref, src, pts }] - mapped contacts and their dip guides (explicitMapLines.js)
export function explicitPoints(def, sections, { spacing = 10, maxPoints = 1200, extraLines = [] } = {}) {
  const picks = (def?.picks || []).filter((p) => [p.x, p.y, p.z].every(Number.isFinite)).map((p) => ({ x: p.x, y: p.y, z: p.z, src: "pick", ref: p.id }));
  const lines = [];
  for (const s of sections || []) for (const c of s.contacts || []) {
    if (c.unit !== def?.name || c.isUpperContact === false || (c.kind && c.kind !== "contact")) continue;
    const pts = (c.points || []).filter((p) => [p.x, p.y, p.z].every(Number.isFinite));
    if (pts.length) lines.push({ section: s.name, pts });
  }
  let len = 0, verts = 0;
  for (const l of lines) { verts += l.pts.length; for (let i = 1; i < l.pts.length; i++) len += dist3(l.pts[i - 1], l.pts[i]); }
  // extra lines come already sampled (a point every ~25 m): taken as they are, every k-th point kept if they would not
  // fit in what the picks and section-line corners leave (half of it at most, so section lines still get filled in)
  const extra = extraLines.map((l) => ({ ref: l.ref, src: l.src || "line", pts: (l.pts || []).filter((p) => [p.x, p.y, p.z].every(Number.isFinite)) })).filter((l) => l.pts.length);
  const nExtra = extra.reduce((s, l) => s + l.pts.length, 0);
  const extraRoom = Math.max(0, lines.length ? Math.floor((maxPoints - picks.length - verts) / 2) : maxPoints - picks.length);
  const every = nExtra > extraRoom ? Math.ceil(nExtra / Math.max(1, extraRoom)) : 1;
  const extraPts = [];
  for (const l of extra) l.pts.forEach((p, i) => { if (i % every === 0 || i === l.pts.length - 1) extraPts.push({ x: p.x, y: p.y, z: p.z, src: l.src, ref: l.ref }); });
  const room = maxPoints - picks.length - verts - extraPts.length;
  const step = Math.max(spacing, room > 0 ? len / room : Infinity);
  const out = picks.slice();
  for (const l of lines) {
    l.pts.forEach((p, i) => {
      out.push({ x: p.x, y: p.y, z: p.z, src: "section", ref: l.section });
      const q = l.pts[i + 1];
      if (!q || !Number.isFinite(step)) return;
      const k = Math.max(0, Math.ceil(dist3(p, q) / step - 1e-9) - 1); // the fewest points at most `step` apart
      for (let j = 1; j < k + 1; j++) {
        const t = j / (k + 1);
        out.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t, z: p.z + (q.z - p.z) * t, src: "section", ref: l.section });
      }
    });
  }
  out.push(...extraPts);
  return { points: out, picks: picks.length, lines: lines.length, sections: new Set(lines.map((l) => l.section)).size, spacing: Number.isFinite(step) ? step : null,
    mapLines: extra.filter((l) => l.src === "map").length, guideLines: extra.filter((l) => l.src === "guide").length, drawnLines: extra.filter((l) => l.src === "drawn").length, extraPoints: extraPts.length, extraEvery: every };
}

// symmetric 3x3 eigen-decomposition (Jacobi); returns { values, vectors (columns) } sorted by value ascending
export function eigSym3(m) { // exported for pileOrder.js (#817)
  const a = m.map((r) => r.slice()), v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 50; sweep++) {
    const off = Math.abs(a[0][1]) + Math.abs(a[0][2]) + Math.abs(a[1][2]);
    if (off < 1e-14 * (Math.abs(a[0][0]) + Math.abs(a[1][1]) + Math.abs(a[2][2]) + 1e-300)) break;
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
      if (Math.abs(a[p][q]) < 1e-300) continue;
      const th = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < 3; k++) { const akp = a[k][p], akq = a[k][q]; a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq; }
      for (let k = 0; k < 3; k++) { const apk = a[p][k], aqk = a[q][k]; a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk; }
      for (let k = 0; k < 3; k++) { const vkp = v[k][p], vkq = v[k][q]; v[k][p] = c * vkp - s * vkq; v[k][q] = s * vkp + c * vkq; }
    }
  }
  const idx = [0, 1, 2].sort((i, j) => a[i][i] - a[j][j]);
  return { values: idx.map((i) => a[i][i]), vectors: idx.map((i) => [v[0][i], v[1][i], v[2][i]]) };
}

const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
const crossV = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// The surface's frame: origin at the centroid, n its "up" (vertical unless the points' plane is steeper than
// steepDeg), e1 / e2 in the plane (e1 horizontal along strike when the plane is tilted).
// frame (#824): "auto" (the rule above), "map" (always elevation over the map), "plane" (always over the best-fit plane)
export function surfaceFrame(points, { steepDeg = 30, frame = "auto" } = {}) {
  const n0 = points.length;
  const c = [0, 0, 0];
  for (const p of points) { c[0] += p.x; c[1] += p.y; c[2] += p.z; }
  c[0] /= n0; c[1] /= n0; c[2] /= n0;
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const p of points) {
    const d = [p.x - c[0], p.y - c[1], p.z - c[2]];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] += d[i] * d[j];
  }
  const { values, vectors } = eigSym3(C);
  let n = [0, 0, 1], steep = false, dip = 0;
  if (n0 >= 3 && values[1] > 1e-6 * values[2]) {
    let f = norm(vectors[0]);
    if (f[2] < 0) f = f.map((x) => -x);
    dip = (Math.acos(Math.min(1, Math.abs(f[2]))) * 180) / Math.PI;
    if (frame === "plane" || (frame !== "map" && dip >= steepDeg)) { n = f; steep = true; }
  }
  const e1 = Math.hypot(n[0], n[1]) < 1e-9 ? [1, 0, 0] : norm(crossV([0, 0, 1], n)); // horizontal, along strike
  const e2 = crossV(n, e1);
  return { origin: c, n, e1, e2, steep, dip };
}

// dense solve A x = b, partial pivoting; A is an M x M Float64Array (row-major), overwritten
function solveDense(A, b, M) {
  for (let k = 0; k < M; k++) {
    let piv = k, best = Math.abs(A[k * M + k]);
    for (let i = k + 1; i < M; i++) { const v = Math.abs(A[i * M + k]); if (v > best) { best = v; piv = i; } }
    if (!(best > 1e-12)) return null;
    if (piv !== k) {
      for (let j = 0; j < M; j++) { const t = A[k * M + j]; A[k * M + j] = A[piv * M + j]; A[piv * M + j] = t; }
      const t = b[k]; b[k] = b[piv]; b[piv] = t;
    }
    const akk = A[k * M + k];
    for (let i = k + 1; i < M; i++) {
      const f = A[i * M + k] / akk;
      if (f === 0) continue;
      const ri = i * M, rk = k * M;
      for (let j = k; j < M; j++) A[ri + j] -= f * A[rk + j];
      b[i] -= f * b[k];
    }
  }
  const x = new Float64Array(M);
  for (let i = M - 1; i >= 0; i--) {
    let s = b[i];
    for (let j = i + 1; j < M; j++) s -= A[i * M + j] * x[j];
    x[i] = s / A[i * M + i];
  }
  return x;
}

const phi = (r2) => (r2 > 0 ? 0.5 * r2 * Math.log(r2) : 0); // r^2 log r, from r^2

// Thin-plate spline through (u, v, w) exactly. Coordinates are scaled to about unit size first (conditioning).
export function thinPlate(u, v, w) {
  const N = u.length, M = N + 3;
  let cu = 0, cv = 0;
  for (let i = 0; i < N; i++) { cu += u[i]; cv += v[i]; }
  cu /= N; cv /= N;
  let L = 0;
  for (let i = 0; i < N; i++) L = Math.max(L, Math.abs(u[i] - cu), Math.abs(v[i] - cv));
  L = L || 1;
  const su = Float64Array.from(u, (x) => (x - cu) / L), sv = Float64Array.from(v, (x) => (x - cv) / L);
  const A = new Float64Array(M * M), b = new Float64Array(M);
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) { const du = su[i] - su[j], dv = sv[i] - sv[j]; const k = phi(du * du + dv * dv); A[i * M + j] = k; A[j * M + i] = k; }
    A[i * M + N] = 1; A[i * M + N + 1] = su[i]; A[i * M + N + 2] = sv[i];
    A[N * M + i] = 1; A[(N + 1) * M + i] = su[i]; A[(N + 2) * M + i] = sv[i];
    b[i] = w[i];
  }
  const x = solveDense(A, b, M);
  if (!x) return null;
  return (uq, vq) => {
    const a = (uq - cu) / L, c = (vq - cv) / L;
    let s = x[N] + x[N + 1] * a + x[N + 2] * c;
    for (let i = 0; i < N; i++) { const du = a - su[i], dv = c - sv[i]; s += x[i] * phi(du * du + dv * dv); }
    return s;
  };
}

export function fitExplicitSurface(points, { margin = null, resolution = 80, groundAt = null, mergeTol = 0.5, frame = "auto" } = {}) {
  const warnings = [];
  const pts = [];
  for (const p of points) if (!pts.some((q) => dist3(p, q) < mergeTol)) pts.push(p); // a repeated pick is one constraint
  if (pts.length < 3) throw new Error(tr("An explicit surface needs at least 3 points: pick contacts in 3D, or draw lines tagged with its name on sections."));
  const F = surfaceFrame(pts, { frame });
  const toF = (p) => { const d = [p.x - F.origin[0], p.y - F.origin[1], p.z - F.origin[2]]; return [dot(d, F.e1), dot(d, F.e2), dot(d, F.n)]; };
  const fromF = (u, v, w) => [F.origin[0] + u * F.e1[0] + v * F.e2[0] + w * F.n[0], F.origin[1] + u * F.e1[1] + v * F.e2[1] + w * F.n[1], F.origin[2] + u * F.e1[2] + v * F.e2[2] + w * F.n[2]];
  let uvw = pts.map(toF);
  // two points (almost) on top of each other in the plane but apart across it: one height field can't take both
  const keep = uvw.map(() => true);
  let conflicts = 0, worst = 0;
  for (let i = 0; i < uvw.length; i++) {
    if (!keep[i]) continue;
    for (let j = i + 1; j < uvw.length; j++) {
      if (!keep[j]) continue;
      if (Math.hypot(uvw[i][0] - uvw[j][0], uvw[i][1] - uvw[j][1]) < mergeTol) { keep[j] = false; conflicts++; worst = Math.max(worst, Math.abs(uvw[i][2] - uvw[j][2])); }
    }
  }
  if (conflicts) warnings.push(tr("{n} point(s) lie straight above or below another point ({d} m apart at most) and were left out: one surface cannot pass through both. If the surface really folds back, model it as two surfaces.", { n: conflicts, d: worst.toFixed(1) }));
  const used = pts.filter((_, i) => keep[i]);
  uvw = uvw.filter((_, i) => keep[i]);
  // collinear in the plane (e.g. one section line only): the surface is not defined sideways
  let mu = 0, mv = 0;
  for (const [u, v] of uvw) { mu += u; mv += v; }
  mu /= uvw.length; mv /= uvw.length;
  let suu = 0, svv = 0, suv = 0;
  for (const [u, v] of uvw) { suu += (u - mu) ** 2; svv += (v - mv) ** 2; suv += (u - mu) * (v - mv); }
  const tr2 = suu + svv, det = suu * svv - suv * suv, lmin = tr2 / 2 - Math.sqrt(Math.max(0, (tr2 * tr2) / 4 - det));
  if (!(lmin > 1e-6 * tr2) || used.length < 3) throw new Error(tr("All the points lie along one line (for example a single section): the surface is not defined to either side of it. Add picks or a line on another section."));
  const U = uvw.map((q) => q[0]), V = uvw.map((q) => q[1]), W = uvw.map((q) => q[2]);
  const f = thinPlate(U, V, W);
  if (!f) throw new Error(tr("The explicit surface could not be solved (the points are degenerate)."));
  let residualMax = 0;
  for (let i = 0; i < U.length; i++) residualMax = Math.max(residualMax, Math.abs(f(U[i], V[i]) - W[i]));
  // grid over the points' extent + margin, then every point inserted as a vertex
  const umin = Math.min(...U), umax = Math.max(...U), vmin = Math.min(...V), vmax = Math.max(...V);
  const span = Math.max(umax - umin, vmax - vmin);
  const m = margin == null ? 0.15 * span : Math.max(0, margin);
  const u0 = umin - m, u1 = umax + m, v0 = vmin - m, v1 = vmax + m;
  const cell = Math.max(u1 - u0, v1 - v0) / Math.max(4, resolution);
  const nx = Math.max(2, Math.round((u1 - u0) / cell) + 1), ny = Math.max(2, Math.round((v1 - v0) / cell) + 1);
  const du = (u1 - u0) / (nx - 1), dv = (v1 - v0) / (ny - 1);
  const node2 = [], nodeW = [];
  // a grid node closer than 0.3 cell to a point is dropped (the point replaces it; no sliver triangles)
  const near = new Set();
  for (const [u, v] of uvw) {
    const i = Math.round((u - u0) / du), j = Math.round((v - v0) / dv);
    if (i >= 0 && i < nx && j >= 0 && j < ny && Math.hypot(u0 + i * du - u, v0 + j * dv - v) < 0.3 * Math.min(du, dv)) near.add(j * nx + i);
  }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (near.has(j * nx + i) && i > 0 && j > 0 && i < nx - 1 && j < ny - 1) continue; // keep the outline nodes
    const u = u0 + i * du, v = v0 + j * dv;
    node2.push(u, v); nodeW.push(f(u, v));
  }
  for (let k = 0; k < U.length; k++) { node2.push(U[k], V[k]); nodeW.push(W[k]); }
  const del = new Delaunay(Float64Array.from(node2));
  const nv = nodeW.length;
  const world = [];
  for (let k = 0; k < nv; k++) { const [x, y, z] = fromF(node2[2 * k], node2[2 * k + 1], nodeW[k]); world.push({ x, y, z }); }
  let faces = [];
  const T = del.triangles;
  for (let t = 0; t < T.length; t += 3) faces.push([T[t], T[t + 1], T[t + 2]]);
  let verts = world, groundCut = 0;
  if (groundAt) {
    const c = clipMesh(world, faces, (p) => { const g = groundAt(p.x, p.y); return Number.isFinite(g) && p.z > g; });
    groundCut = c.removed + c.split;
    if (!c.faces.length) throw new Error(tr("The whole explicit surface lies above the terrain."));
    // clipMesh keeps every input vertex; drop the ones no triangle uses any more (they are above the ground)
    const remap = new Int32Array(c.verts.length).fill(-1);
    verts = [];
    faces = c.faces.map((fc) => fc.map((k) => { if (remap[k] < 0) { remap[k] = verts.length; verts.push(c.verts[k]); } return remap[k]; }));
  }
  const positions = new Float64Array(verts.length * 3);
  verts.forEach((p, k) => { positions[3 * k] = p.x; positions[3 * k + 1] = p.y; positions[3 * k + 2] = p.z; });
  // indices wound so the normals face the frame's n (up, or the plane's upper side)
  const indices = new Uint32Array(faces.length * 3);
  faces.forEach(([a, b, c], k) => {
    const A = verts[a], B = verts[b], C = verts[c];
    const nn = crossV([B.x - A.x, B.y - A.y, B.z - A.z], [C.x - A.x, C.y - A.y, C.z - A.z]);
    const flip = dot(nn, F.n) < 0;
    indices[3 * k] = a; indices[3 * k + 1] = flip ? c : b; indices[3 * k + 2] = flip ? b : c;
  });
  return { positions, indices, n: used.length, frame: F, residualMax, warnings, groundCut, cell: Math.min(du, dv), margin: m };
}
