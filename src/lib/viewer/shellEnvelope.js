// TASKS.csv #3673 (Matt, 2026-11-15: "Our grade shell should look more like these dxfs") — a grade shell as a continuous ENVELOPE, as a
// consultant draws a domain: one or a few smooth bodies at a cut-off that keep the internal dilution, not #3655's tight shell that hugs each
// composite and, at a low cut-off, falls apart into many bodies round single intervals.
//
// The envelope is an indicator model: each composite is 1 at or above the cut-off, else 0, interpolated (inverse distance) in each drilled
// area along the plane of that area's composites at the cut-off (#3593's fit, lib/samplesTrend.js) with ranges from the sample spacing
// (ENVELOPE_RANGES: 4 spacings along the plane's long axis, 3 across it within the plane, 1 through it), and the surface drawn where the
// probability reaches an iso (default 0.5). No reach clip: the envelope is meant to close between holes. Then the field is cleaned
// (cleanField: parts under a share of the shell's volume dropped, voids inside filled) and the mesh smoothed (taubinSmooth: volume-keeping).
//
// How it compares with a consultant's domain and with the tight shell, and where it does not suit (narrow zones at a high cut-off, e.g.
// Macpass Ag at its P90), is in #3673's notes.
import { samplesTrendByArea } from "../samplesTrend.js";
import { trendBasis, trendSearchScales } from "../trend.js";

export const ENVELOPE_RANGES = { major: 4, semi: 3, minor: 1 }; // in sample spacings
export const ENVELOPE_ISO = 0.5, ENVELOPE_MAX_SAMPLES = 32;
export const ENVELOPE_MIN_COMPOSITES = 30, ENVELOPE_MIN_HOLES = 4;
const r1 = (v) => Math.round(v * 10) / 10;

// the composites as indicators at the cut-off (a copy: 1 at or above it, else 0)
export const indicatorPoints = (points, cutoff) => (points || []).map((p) => ({ ...p, value: p.value >= cutoff ? 1 : 0 }));

// an area's envelope search: its at-cut composites' plane with the ranges in spacings. atPts: [{ x, y, z, hole_id }]; spacingM: the sample
// spacing (lib/sampleSpacing.js). -> null (too few for a plane: a sphere of ranges.semi spacings) or { trend, basis, scales, majorM, axesM, n, holes }
export function envelopeSearch(atPts, spacingM, { ranges = ENVELOPE_RANGES, minComposites = ENVELOPE_MIN_COMPOSITES, minHoles = ENVELOPE_MIN_HOLES } = {}) {
  const pts = (atPts || []).filter((p) => [p?.x, p?.y, p?.z].every(Number.isFinite));
  const holes = new Set(pts.map((p) => p.hole_id)).size;
  if (!(spacingM > 0) || pts.length < minComposites || holes < minHoles) return null;
  const t0 = samplesTrendByArea(pts.map((p) => ({ x: p.x, y: p.y, z: p.z }))).trend;
  if (!t0) return null;
  const trend = { name: "the plane of the composites at the cut-off", dip: t0.dip, dipAzimuth: t0.dipAzimuth, pitch: t0.pitch, ratios: { max: ranges.major, int: ranges.semi, min: ranges.minor } };
  const axesM = [ranges.major, ranges.semi, ranges.minor].map((k) => r1(k * spacingM));
  return { trend, basis: trendBasis(trend), scales: trendSearchScales(trend), majorM: axesM[0], axesM, n: pts.length, holes };
}

// The clean-up of a field before its surface is drawn (nodes at or above `iso` are inside):
//  - parts (6-connected) under minShare of the inside nodes, or under minNodes, are dropped (their nodes lowered to `low`), unless they hold
//    composites at the cut-off from keepHoles holes or more (keepPoints: [{ x, y, z, hole_id }] looked up at their nearest node; grid needs
//    origin and cellSize then): a lens two holes agree on stays, a blob round one hole's interval goes (Macpass Ag 29.8: the share rule alone
//    dropped 9 % of the composites at the cut-off);
//  - voids (outside nodes, NaN included, that no outside path reaches from the grid's boundary) are filled: raised to `high`.
// grid: { nx, ny, nz }. -> { values (a copy when changed), report: { parts, kept, dropped, droppedNodes, voids, filledNodes } }
export function cleanField(values, grid, iso, { minShare = 0.01, minNodes = 0, fillVoids = true, low = null, high = null, keepPoints = null, keepHoles = 2 } = {}) {
  const { nx, ny, nz } = grid, N = nx * ny * nz, NXY = nx * ny;
  const lo = low ?? iso - Math.max(Math.abs(iso), 1e-6), hi = high ?? iso + Math.max(Math.abs(iso), 1e-6);
  const inside = (v) => values[v] >= iso; // NaN: outside
  const lab = new Int32Array(N).fill(-1), sizes = [];
  const stack = new Int32Array(N);
  const each6 = (v, f) => {
    const i = v % nx, j = ((v - i) / nx) % ny, k = (v - i - nx * j) / NXY;
    if (i > 0) f(v - 1); if (i < nx - 1) f(v + 1); if (j > 0) f(v - nx); if (j < ny - 1) f(v + nx); if (k > 0) f(v - NXY); if (k < nz - 1) f(v + NXY);
  };
  let total = 0;
  for (let s = 0; s < N; s++) {
    if (lab[s] >= 0 || !inside(s)) continue;
    const id = sizes.length; let n = 0, top = 0; stack[top++] = s; lab[s] = id;
    while (top) { const v = stack[--top]; n++; each6(v, (w) => { if (lab[w] < 0 && inside(w)) { lab[w] = id; stack[top++] = w; } }); }
    sizes.push(n); total += n;
  }
  const cut = Math.max(minNodes, minShare * total), drop = sizes.map((n) => n < cut);
  if (keepPoints?.length && drop.some(Boolean)) { // the holes whose at-cut composites lie in each small part
    const { origin, cellSize } = grid, holesOf = new Map();
    for (const p of keepPoints) {
      const i = Math.round((p.x - origin.x) / cellSize.dx), j = Math.round((p.y - origin.y) / cellSize.dy), k = Math.round((p.z - origin.z) / cellSize.dz);
      if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) continue;
      const id = lab[i + nx * (j + ny * k)];
      if (id < 0 || !drop[id]) continue;
      (holesOf.get(id) || holesOf.set(id, new Set()).get(id)).add(p.hole_id);
    }
    for (const [id, hs] of holesOf) if (hs.size >= keepHoles) drop[id] = false;
  }
  let out = null, droppedNodes = 0, filledNodes = 0, voids = 0;
  const w = () => (out || (out = Float64Array.from(values)));
  if (drop.some(Boolean)) for (let v = 0; v < N; v++) if (lab[v] >= 0 && drop[lab[v]]) { w()[v] = Math.min(values[v], lo); droppedNodes++; }
  if (fillVoids) {
    // the outside reached from the boundary, through nodes outside after the drop
    const outNow = (v) => !(lab[v] >= 0 && !drop[lab[v]]);
    const seen = new Uint8Array(N); let top = 0;
    const seed = (v) => { if (!seen[v] && outNow(v)) { seen[v] = 1; stack[top++] = v; } };
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) if (i === 0 || j === 0 || k === 0 || i === nx - 1 || j === ny - 1 || k === nz - 1) seed(i + nx * (j + ny * k));
    while (top) { const v = stack[--top]; each6(v, seed); }
    // the outside nodes not reached are voids: filled, counted by connected pocket
    const vlab = new Uint8Array(N);
    for (let s = 0; s < N; s++) {
      if (seen[s] || !outNow(s) || vlab[s]) continue;
      voids++; top = 0; stack[top++] = s; vlab[s] = 1;
      while (top) { const v = stack[--top]; w()[v] = Number.isFinite(values[v]) ? Math.max(values[v], hi) : hi; filledNodes++; each6(v, (u) => { if (!seen[u] && outNow(u) && !vlab[u]) { vlab[u] = 1; stack[top++] = u; } }); }
    }
  }
  return { values: out || values, report: { parts: sizes.length, kept: drop.filter((d) => !d).length, dropped: drop.filter(Boolean).length, droppedNodes, voids, filledNodes } };
}

// Taubin's lambda / mu smoothing (1995): a shrinking Laplacian step (lambda) then an inflating one (mu), so the surface is smoothed without
// the shrinkage plain Laplacian smoothing gives. positions: Float64Array (x y z per vertex), faces: Uint32Array (3 per face), indexed.
// Boundary vertices (on an edge with one face: an open shell) are left where they are. -> a new Float64Array
export function taubinSmooth(positions, faces, { iterations = 10, lambda = 0.5, mu = -0.53 } = {}) {
  const nv = positions.length / 3, P = Float64Array.from(positions);
  // neighbours (unique) by vertex, from the faces' edges; an edge's face count marks the boundary
  const edges = new Map(), key = (a, b) => (a < b ? a * nv + b : b * nv + a);
  for (let f = 0; f < faces.length; f += 3) for (let e = 0; e < 3; e++) { const a = faces[f + e], b = faces[f + ((e + 1) % 3)], k = key(a, b); edges.set(k, (edges.get(k) || 0) + 1); }
  const deg = new Uint32Array(nv), fixed = new Uint8Array(nv);
  for (const [k, c] of edges) { const a = Math.floor(k / nv), b = k - a * nv; deg[a]++; deg[b]++; if (c === 1) { fixed[a] = 1; fixed[b] = 1; } }
  const start = new Uint32Array(nv + 1); for (let v = 0; v < nv; v++) start[v + 1] = start[v] + deg[v];
  const nb = new Uint32Array(start[nv]), fill = start.slice(0, nv);
  for (const k of edges.keys()) { const a = Math.floor(k / nv), b = k - a * nv; nb[fill[a]++] = b; nb[fill[b]++] = a; }
  const D = new Float64Array(nv * 3);
  const step = (f) => {
    for (let v = 0; v < nv; v++) {
      const n = start[v + 1] - start[v];
      if (!n || fixed[v]) { D[3 * v] = D[3 * v + 1] = D[3 * v + 2] = 0; continue; }
      let x = 0, y = 0, z = 0;
      for (let t = start[v]; t < start[v + 1]; t++) { const u = nb[t]; x += P[3 * u]; y += P[3 * u + 1]; z += P[3 * u + 2]; }
      D[3 * v] = x / n - P[3 * v]; D[3 * v + 1] = y / n - P[3 * v + 1]; D[3 * v + 2] = z / n - P[3 * v + 2];
    }
    for (let i = 0; i < P.length; i++) P[i] += f * D[i];
  };
  for (let it = 0; it < iterations; it++) { step(lambda); step(mu); }
  return P;
}

// Decimation by the field, not the mesh: a surface's triangle count goes with its area over the cell squared, so an envelope over target
// triangles is drawn from the field averaged over f x f x f blocks (NaN left out of an average; a block with no finite node stays NaN), with
// f = ceil(sqrt(triangles / target)). Unlike edge collapse it keeps the mesh watertight and manifold (marching cubes again), and the averaged
// field still crosses the iso where the fine one does, to within a block.
export const ENVELOPE_TARGET_TRIANGLES = 100000;
export const coarsenFactor = (triangles, target = ENVELOPE_TARGET_TRIANGLES) => (triangles > target ? Math.ceil(Math.sqrt(triangles / target)) : 1);
// grid: { nx, ny, nz, origin, cellSize: { dx, dy, dz } } -> { values: Float64Array, grid } (origin at the first block's centre)
export function coarsenField(values, grid, f) {
  const { nx, ny, nz, origin, cellSize } = grid;
  if (!(f > 1)) return { values, grid };
  const mx = Math.ceil(nx / f), my = Math.ceil(ny / f), mz = Math.ceil(nz / f), out = new Float64Array(mx * my * mz);
  for (let K = 0; K < mz; K++) for (let J = 0; J < my; J++) for (let I = 0; I < mx; I++) {
    let s = 0, n = 0;
    for (let k = K * f; k < Math.min(nz, K * f + f); k++) for (let j = J * f; j < Math.min(ny, J * f + f); j++) for (let i = I * f; i < Math.min(nx, I * f + f); i++) {
      const v = values[i + nx * (j + ny * k)]; if (Number.isFinite(v)) { s += v; n++; }
    }
    out[I + mx * (J + my * K)] = n ? s / n : NaN;
  }
  const half = (d) => ((f - 1) * d) / 2;
  return { values: out, grid: { nx: mx, ny: my, nz: mz, origin: { x: origin.x + half(cellSize.dx), y: origin.y + half(cellSize.dy), z: origin.z + half(cellSize.dz) }, cellSize: { dx: cellSize.dx * f, dy: cellSize.dy * f, dz: cellSize.dz * f } } };
}
