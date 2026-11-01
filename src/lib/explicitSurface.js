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

// TASKS.csv #869 — Douglas-Peucker in 3D: the indices of the vertices kept so no dropped vertex is more than tol from
// the simplified line. Ends always stay, and so do corners (a corner sticks out of the chord), unlike every-k-th thinning.
export function simplifyLine(pts, tol) {
  const n = pts.length;
  if (n <= 2 || !(tol > 0)) return pts.map((_, i) => i);
  const keep = new Uint8Array(n); keep[0] = keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const A = pts[a], B = pts[b], d = [B.x - A.x, B.y - A.y, B.z - A.z], L2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
    let worst = -1, wi = -1;
    for (let i = a + 1; i < b; i++) {
      const P = pts[i], v = [P.x - A.x, P.y - A.y, P.z - A.z];
      const t = L2 > 0 ? Math.max(0, Math.min(1, (v[0] * d[0] + v[1] * d[1] + v[2] * d[2]) / L2)) : 0;
      const e = Math.hypot(v[0] - t * d[0], v[1] - t * d[1], v[2] - t * d[2]);
      if (e > worst) { worst = e; wi = i; }
    }
    if (worst > tol) { keep[wi] = 1; stack.push([a, wi], [wi, b]); }
  }
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(i);
  return out;
}
// the smallest tolerance from the ladder that brings a set of lines to at most `budget` vertices -> { lines, tol }
const TOLERANCES_M = [0.25, 0.5, 1, 2, 5, 10, 25];
function simplifyToBudget(lines, budget) {
  const count = (ls) => ls.reduce((s, l) => s + l.pts.length, 0);
  if (count(lines) <= budget) return { lines, tol: 0 };
  let res = lines, tol = 0;
  for (const t of TOLERANCES_M) {
    tol = t;
    res = lines.map((l) => ({ ...l, pts: simplifyLine(l.pts, t).map((i) => l.pts[i]) }));
    if (count(res) <= budget) break;
  }
  return { lines: res, tol };
}

// extraLines (#817): further hard lines, [{ ref, src, pts }] - mapped contacts and their dip guides (explicitMapLines.js)
// TASKS.csv #869 — maxPoints is now a real cap: over-long section lines and extra lines are simplified (Douglas-Peucker,
// the smallest tolerance that fits; returned as lineTolM / extraTolM) instead of every vertex being kept, and a set that
// still exceeds hardMax (picks alone, or lines no 25 m tolerance can bring down) comes back with `tooMany` (the message) set,
// for the caller to refuse the build with.
export function explicitPoints(def, sections, { spacing = 10, maxPoints = 1200, hardMax = Math.round(maxPoints * 1.5), extraLines = [] } = {}) {
  const picks = (def?.picks || []).filter((p) => [p.x, p.y, p.z].every(Number.isFinite)).map((p) => ({ x: p.x, y: p.y, z: p.z, src: "pick", ref: p.id, ...(p.dir ? { dir: p.dir } : {}), ...(p.hole_id ? { hole: p.hole_id, md: p.md } : {}) })); // dir: #856; hole / md: #857 (named in the quality report)
  const lines = [];
  for (const s of sections || []) for (const c of s.contacts || []) {
    if (c.unit !== def?.name || c.target === "unit" || c.isUpperContact === false || (c.kind && c.kind !== "contact")) continue; // target: #1193
    const pts = (c.points || []).filter((p) => [p.x, p.y, p.z].every(Number.isFinite));
    if (pts.length) lines.push({ section: s.name, pts });
  }
  // #869 — section-line vertices may use at most 3/4 of what the picks leave (the rest: extra lines and filling in)
  const vertsIn = lines.reduce((s, l) => s + l.pts.length, 0);
  const sl = simplifyToBudget(lines, Math.max(2 * lines.length, Math.floor((maxPoints - picks.length) * 0.75)));
  lines.splice(0, lines.length, ...sl.lines);
  let len = 0, verts = 0;
  for (const l of lines) { verts += l.pts.length; for (let i = 1; i < l.pts.length; i++) len += dist3(l.pts[i - 1], l.pts[i]); }
  // extra lines come already sampled (a point every ~25 m): taken as they are, simplified (#869: ends and corners kept)
  // if they would not fit in what the picks and section-line corners leave (half of it at most, so section lines still
  // get filled in)
  const extra = extraLines.map((l) => ({ ref: l.ref, src: l.src || "line", pts: (l.pts || []).filter((p) => [p.x, p.y, p.z].every(Number.isFinite)) })).filter((l) => l.pts.length);
  const nExtra = extra.reduce((s, l) => s + l.pts.length, 0);
  const extraRoom = Math.max(0, lines.length ? Math.floor((maxPoints - picks.length - verts) / 2) : maxPoints - picks.length);
  const ex = simplifyToBudget(extra, Math.max(2 * extra.length, extraRoom));
  const extraPts = [];
  for (const l of ex.lines) for (const p of l.pts) extraPts.push({ x: p.x, y: p.y, z: p.z, src: l.src, ref: l.ref });
  const every = extraPts.length < nExtra ? Math.round(nExtra / Math.max(1, extraPts.length)) : 1;
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
  const tooMany = out.length > hardMax ? tr("Too many points to build quickly: {n} ({picks} picks, {v} line points) against a limit of {max}. Remove some picks, or draw fewer or shorter lines.", { n: out.length, picks: picks.length, v: out.length - picks.length, max: hardMax }) : null;
  return { tooMany, points: out, picks: picks.length, lines: lines.length, sections: new Set(lines.map((l) => l.section)).size, spacing: Number.isFinite(step) ? step : null,
    mapLines: extra.filter((l) => l.src === "map").length, guideLines: extra.filter((l) => l.src === "guide").length, downholeLines: extra.filter((l) => l.src === "downhole").length, drawnLines: extra.filter((l) => l.src === "drawn").length, extraPoints: extraPts.length, extraEvery: every,
    lineTolM: sl.tol, lineVerticesIn: vertsIn, lineVerticesKept: verts, extraTolM: ex.tol };
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
// TASKS.csv #856 — a FENCE: picks taken on holes of one drill section (or two close ones) spread most along the section
// and up and down it, so the best-fit plane is the section itself, steep, and the old rule modelled the contact as a
// vertical sheet standing in the section. Points may carry `dir`, the hole's direction at the pick: when most of the
// known directions lie IN the candidate plane (within 15 deg), that plane is the drilling plane, not the contact (a real
// steep contact is crossed by the holes that pick it), and the map frame is kept. fence: true is returned.
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
  let n = [0, 0, 1], steep = false, dip = 0, fence = false;
  if (n0 >= 3 && values[1] > 1e-6 * values[2]) {
    let f = norm(vectors[0]);
    if (f[2] < 0) f = f.map((x) => -x);
    dip = (Math.acos(Math.min(1, Math.abs(f[2]))) * 180) / Math.PI;
    if (frame === "auto" && dip >= steepDeg) {
      let known = 0, inPlane = 0;
      for (const p of points) {
        if (!p.dir) continue;
        const d = norm(p.dir);
        known++;
        if (Math.abs(dot(d, f)) < 0.26) inPlane++; // sin 15 deg
      }
      fence = known >= 3 && inPlane >= 0.75 * known;
    }
    if (frame === "plane" || (frame !== "map" && dip >= steepDeg && !fence)) { n = f; steep = true; }
  }
  const e1 = Math.hypot(n[0], n[1]) < 1e-9 ? [1, 0, 0] : norm(crossV([0, 0, 1], n)); // horizontal, along strike
  const e2 = crossV(n, e1);
  return { origin: c, n, e1, e2, steep, dip, fence };
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

// dense inverse by Gauss-Jordan with partial pivoting (A is overwritten); null when singular
function invertDense(A, M) {
  const I = new Float64Array(M * M);
  for (let i = 0; i < M; i++) I[i * M + i] = 1;
  for (let k = 0; k < M; k++) {
    let piv = k, best = Math.abs(A[k * M + k]);
    for (let i = k + 1; i < M; i++) { const v = Math.abs(A[i * M + k]); if (v > best) { best = v; piv = i; } }
    if (!(best > 1e-12)) return null;
    if (piv !== k) for (let j = 0; j < M; j++) { let t = A[k * M + j]; A[k * M + j] = A[piv * M + j]; A[piv * M + j] = t; t = I[k * M + j]; I[k * M + j] = I[piv * M + j]; I[piv * M + j] = t; }
    const inv = 1 / A[k * M + k];
    for (let j = 0; j < M; j++) { A[k * M + j] *= inv; I[k * M + j] *= inv; }
    for (let i = 0; i < M; i++) {
      if (i === k) continue;
      const f = A[i * M + k];
      if (f === 0) continue;
      for (let j = 0; j < M; j++) { A[i * M + j] -= f * A[k * M + j]; I[i * M + j] -= f * I[k * M + j]; }
    }
  }
  return I;
}

// TASKS.csv #857 — leave-one-out errors of the thin-plate spline without refitting N times: for an interpolant
// s = A^-1 b, the error at point k when k is left out is c_k / (A^-1)_kk (Rippa 1999, Advances in Computational
// Mathematics 11, 193-210; it holds for the system augmented with the linear part). One inverse: O(N^3).
export const LOO_MAX_POINTS = 300;
const CONSTRUCTED_SRC = new Set(["downhole", "guide"]);
export function thinPlateLoo(u, v, w) {
  const N = u.length, M = N + 3;
  if (N < 4) return null;
  let cu = 0, cv = 0;
  for (let i = 0; i < N; i++) { cu += u[i]; cv += v[i]; }
  cu /= N; cv /= N;
  let L = 0;
  for (let i = 0; i < N; i++) L = Math.max(L, Math.abs(u[i] - cu), Math.abs(v[i] - cv));
  L = L || 1;
  const su = Float64Array.from(u, (x) => (x - cu) / L), sv = Float64Array.from(v, (x) => (x - cv) / L);
  const A = new Float64Array(M * M);
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) { const du = su[i] - su[j], dv = sv[i] - sv[j]; const k = phi(du * du + dv * dv); A[i * M + j] = k; A[j * M + i] = k; }
    A[i * M + N] = 1; A[i * M + N + 1] = su[i]; A[i * M + N + 2] = sv[i];
    A[N * M + i] = 1; A[(N + 1) * M + i] = su[i]; A[(N + 2) * M + i] = sv[i];
  }
  const Ai = invertDense(A, M);
  if (!Ai) return null;
  const e = new Float64Array(N);
  for (let k = 0; k < N; k++) {
    let c = 0;
    for (let j = 0; j < N; j++) c += Ai[k * M + j] * w[j];
    e[k] = c / Ai[k * M + k];
  }
  return e;
}
const pointInPoly = (x, y, poly) => { let inside = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside; } return inside; };

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

// TASKS.csv #881 — a structural trend (#650, { dip, dipAzimuth, pitch, ratios }) as anisotropy in the surface's own plane:
// the long axis of the trend ellipsoid's section by the frame's plane (u, v) is the long direction, and distances along
// it count `ratio` (the section's axis ratio) times less: an elongated body's contact stays smooth further along its
// trend. -> { a(u, v), b(u, v), ratio, azimuthDeg } | { skip, ratio, azimuthDeg } (under 1.1: nearly round) | null
export function trendInPlane(trend, F) {
  if (!trend) return null;
  const rad = Math.PI / 180, dd = (Number(trend.dipAzimuth) || 0) * rad, dp = (Number(trend.dip) || 0) * rad, p = (Number(trend.pitch) || 0) * rad;
  const strike = [-Math.cos(dd), Math.sin(dd), 0], down = [Math.sin(dd) * Math.cos(dp), Math.cos(dd) * Math.cos(dp), -Math.sin(dp)];
  const major = strike.map((s, i) => Math.cos(p) * s + Math.sin(p) * down[i]), semi = strike.map((s, i) => -Math.sin(p) * s + Math.cos(p) * down[i]);
  const minor = crossV(major, semi);
  const r = trend.ratios || {}, rMax = Number(r.max) || 1, rInt = Number(r.int) || 1, rMin = Number(r.min) || 1;
  // TASKS.csv #940 — the in-plane anisotropy is the SECTION of the trend ellipsoid by the surface's plane (what the implicit
  // tool's 3D warp applies, #650 / #653), not the major axis projected with max / int: that ignored the other axes' share
  // of the plane and was >30 deg off in about a fifth of trends (a steep vein-set trend on a flat contact: 1.5x along 090
  // applied, 1.89x along 000 true). The section's 2 x 2 form M_ij = sum_k (e_i . a_k)(e_j . a_k) / r_k^2: its smallest-
  // eigenvalue eigenvector is the long axis, and sqrt(l2 / l1) the ratio. This also replaces the old fallback to the
  // intermediate axis (with the wrong ratio) for a trend nearly normal to the surface.
  let m11 = 0, m12 = 0, m22 = 0;
  for (const [ax, rk] of [[major, rMax], [semi, rInt], [minor, rMin]]) { const u = dot(ax, F.e1), v = dot(ax, F.e2), w = 1 / (rk * rk); m11 += u * u * w; m12 += u * v * w; m22 += v * v * w; }
  const tr2 = m11 + m22, disc = Math.sqrt(Math.max(0, ((m11 - m22) / 2) ** 2 + m12 * m12));
  const l1 = tr2 / 2 - disc, l2 = tr2 / 2 + disc;
  if (!(l1 > 0)) return null;
  const ratio = Math.sqrt(l2 / l1);
  // the eigenvector of l1 (the long axis)
  let mu = m12, mv = l1 - m11;
  if (Math.hypot(mu, mv) < 1e-12) { mu = l1 - m22; mv = m12; }
  if (Math.hypot(mu, mv) < 1e-12) { mu = 1; mv = 0; }
  const l = Math.hypot(mu, mv); mu /= l; mv /= l;
  const world = [mu * F.e1[0] + mv * F.e2[0], mu * F.e1[1] + mv * F.e2[1]];
  let az = (Math.atan2(world[0], world[1]) * 180) / Math.PI; if (az < 0) az += 360; if (az >= 180) az -= 180;
  // nearly round in this plane: not applied (the caller says so)
  if (ratio < 1.1) return { skip: true, ratio, azimuthDeg: az };
  return { a: (u, v) => (u * mu + v * mv) / ratio, b: (u, v) => -u * mv + v * mu, ratio, azimuthDeg: az };
}

export function fitExplicitSurface(points, { margin = null, marginBasis = "short", resolution = 80, groundAt = null, mergeTol = 0.5, frame = "auto", trend = null } = {}) {
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
  // #856 — "along one line" is a shape test: the narrow side under 2 % of the long side (it was 0.1 %, which let a 500 x 4 m
  // strip of picks through and the spline swung 1,056 m across it)
  if (F.fence && !(lmin > 4e-4 * tr2)) throw new Error(tr("The picks lie in the plane of one drill section (the holes were drilled along it), so they cannot show how the contact runs across the section. Pick it on holes of another section, or draw it on a second section."));
  if (!(lmin > 4e-4 * tr2) || used.length < 3) throw new Error(tr("All the points lie along one line (for example a single section): the surface is not defined to either side of it. Add picks or a line on another section. (A steep surface such as a dyke or fault picked in one plane: set Shape to Over its own plane.)"));
  const U = uvw.map((q) => q[0]), V = uvw.map((q) => q[1]), W = uvw.map((q) => q[2]);
  // #881 — with a trend the spline is fitted in the stretched coordinates (and evaluated through them): still exact at
  // every input, smoother along the trend
  const an0 = trendInPlane(trend, F), an = an0 && !an0.skip ? an0 : null; // #940: a skipped (nearly round) trend is said
  if (an0?.skip) warnings.push(tr("The structural trend is almost round within this surface's plane ({r} times along {az}°), so it was not applied: this trend does not describe continuity within this surface.", { r: an0.ratio.toFixed(2), az: Math.round(an0.azimuthDeg) }));
  const UA = an ? U.map((u, i) => an.a(u, V[i])) : U, VA = an ? U.map((u, i) => an.b(u, V[i])) : V;
  const fA = thinPlate(UA, VA, W);
  const f = fA && an ? (u, v) => fA(an.a(u, v), an.b(u, v)) : fA;
  if (!f) throw new Error(tr("The explicit surface could not be solved (the points are degenerate)."));
  let residualMax = 0;
  for (let i = 0; i < U.length; i++) residualMax = Math.max(residualMax, Math.abs(f(U[i], V[i]) - W[i]));
  // grid over the points' extent + margin, then every point inserted as a vertex
  const umin = Math.min(...U), umax = Math.max(...U), vmin = Math.min(...V), vmax = Math.max(...V);
  const span = Math.max(umax - umin, vmax - vmin);
  // TASKS.csv #1013 — the automatic margin is 15 % of the inputs' SHORTER span (at least a quarter of the longer one's
  // 15 %, so a narrow strip still reaches past its ends). It was 15 % of the longest span on every side: a steep contact's
  // long down-dip span made most of the mesh extrapolation (Matt: "do it", after #977 shaded it). marginBasis "long" keeps
  // the old reach for a fault-block surface (#861): it is cut at the fault, so it must reach it, and the far side goes.
  const m = margin != null ? Math.max(0, margin) : marginBasis === "long" ? 0.15 * span : 0.15 * Math.max(Math.min(umax - umin, vmax - vmin), span / 4);
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
  // TASKS.csv #857 / #870 — what the surface does where there is no data. The fit at the inputs is exact by construction
  // (residualMax ~ 1e-12 m says only that the solver worked), so it reports instead: (a) how far the surface swings
  // beyond the inputs' own range INSIDE their hull - a spike between two inputs that disagree; (b) leave-one-out errors -
  // how well each input is predicted by the others; (c) how much of the surface lies outside the inputs' hull
  // (extrapolated) and how far its furthest point is from any input.
  const quality = { overshootM: 0, overshootAt: null, beyondPct: 0, furthestM: 0, looRmsM: null, looMaxM: null, looWorst: null, looSkipped: U.length > LOO_MAX_POINTS };
  let supportHull = null; // TASKS.csv #977 — the inputs' hull in the frame, for shading the extrapolated part (explicitSupport.js)
  {
    const hull = U.length >= 3 ? new Delaunay(Float64Array.from(uvw.flatMap((q) => [q[0], q[1]]))).hullPolygon() : null;
    if (hull) supportHull = { origin: F.origin.slice(), e1: F.e1.slice(), e2: F.e2.slice(), uv: hull.flat() };
    const wmin = Math.min(...W), wmax = Math.max(...W);
    const nGrid = node2.length / 2 - U.length;
    let outside = 0;
    for (let k = 0; k < nGrid; k++) {
      const u = node2[2 * k], v = node2[2 * k + 1], w = nodeW[k];
      let dmin = Infinity;
      for (let q = 0; q < U.length; q++) { const d = (U[q] - u) ** 2 + (V[q] - v) ** 2; if (d < dmin) dmin = d; }
      quality.furthestM = Math.max(quality.furthestM, Math.sqrt(dmin));
      if (hull && pointInPoly(u, v, hull)) {
        const over = Math.max(w - wmax, wmin - w);
        if (over > quality.overshootM) { quality.overshootM = over; quality.overshootAt = fromF(u, v, w); }
      } else outside++;
    }
    quality.beyondPct = nGrid ? (100 * outside) / nGrid : 0;
    if (quality.overshootM > Math.max(10, 0.2 * (wmax - wmin))) {
      const [x, y] = quality.overshootAt;
      warnings.push(tr("Between the inputs the surface swings {d} m beyond them (near E {e}, N {n}): usually two inputs that disagree, such as a pick and a section line, or a pick on the wrong contact. Check the inputs there; the leave-one-out figure names the worst one.", { d: quality.overshootM.toFixed(0), e: x.toFixed(0), n: y.toFixed(0) }));
    }
    if (!quality.looSkipped) {
      const e = thinPlateLoo(UA, VA, W); // #881: in the trend's coordinates
      if (e) {
        // TASKS.csv #1227 — over what was observed. Guide lines are built from the picks and predict each other, so counting them took one surface from 100.8 m to 12.4 m RMS.
        const counted = (k) => !CONSTRUCTED_SRC.has(used[k].src);
        let s2 = 0, worst = 0, wi = -1, nObs = 0;
        for (let k = 0; k < e.length; k++) { if (!counted(k)) continue; nObs++; s2 += e[k] * e[k]; if (wi < 0 || Math.abs(e[k]) > worst) { worst = Math.abs(e[k]); wi = k; } }
        if (wi < 0) { for (let k = 0; k < e.length; k++) { s2 += e[k] * e[k]; if (wi < 0 || Math.abs(e[k]) > worst) { worst = Math.abs(e[k]); wi = k; } } nObs = e.length; }
        const p = used[wi];
        quality.looRmsM = Math.sqrt(s2 / nObs); quality.looMaxM = worst; quality.looObserved = nObs; quality.looConstructed = e.length - nObs;
        quality.looWorst = { src: p.src, ref: p.ref ?? null, hole: p.hole ?? null, md: p.md ?? null, x: p.x, y: p.y, z: p.z };
      }
    }
  }
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
  return { positions, indices, n: used.length, frame: F, residualMax, warnings, groundCut, cell: Math.min(du, dv), margin: m, quality, supportHull, trend: an ? { ratio: an.ratio, azimuthDeg: an.azimuthDeg } : null };
}
