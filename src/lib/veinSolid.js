// TASKS.csv #859 — a VEIN SOLID from two surfaces, its hangingwall and footwall (Matt: "vein solid from two surfaces").
// Solid blocks codes a steep pair wrongly (vertical rays meet only one wall over most of the footprint: +186 % at 45°,
// +238 % at 70°, nothing at 90° in the #855 review), so the pair is stitched into a closed solid directly:
//   1. the vein's own frame: the best-fit plane of both walls' vertices (PCA); w along its pole;
//   2. a regular (u, v) grid over the overlap of the two walls' footprints; at each node a segment along the pole is
//      intersected with each wall (BVH, meshQuery.segmentIntersections) - nodes where either wall is missing are out;
//   3. top = the hangingwall sample, bottom = the footwall sample, over every cell whose four nodes have both with a
//      positive thickness; where the walls meet or cross a node is left out (counted), so the solid ends there, within a
//      cell - collapsing it to zero thickness would leave top and bottom faces touching, not a valid solid;
//   4. side walls along the boundary of those cells -> closed by construction; wound outward (signed volume > 0).
// The volume is the mesh's own; thickness is TRUE thickness (along the pole), with min / mean / max over the nodes.
// Honest limits, returned with the result: the solid ends where either wall ends (no extrapolation), and its edges are
// stepped at the grid cell (cell size returned). Pure: no three.js.
import { buildMeshQuery, segmentIntersections } from "./meshQuery.js";
import { eigSym3 } from "./explicitSurface.js";

const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const nrm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

export function veinSolidFromSurfaces(hw, fw, { cells = 100 } = {}) {
  // 1. frame from all vertices of both walls
  const all = [hw.positions, fw.positions];
  let n0 = 0; const c = [0, 0, 0];
  for (const P of all) for (let i = 0; i < P.length; i += 3) { c[0] += P[i]; c[1] += P[i + 1]; c[2] += P[i + 2]; n0++; }
  if (n0 < 6) throw new Error("veinSolidFromSurfaces: empty walls");
  c[0] /= n0; c[1] /= n0; c[2] /= n0;
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const P of all) for (let i = 0; i < P.length; i += 3) { const d = [P[i] - c[0], P[i + 1] - c[1], P[i + 2] - c[2]]; for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) C[a][b] += d[a] * d[b]; }
  const { vectors } = eigSym3(C);
  const n = nrm(vectors[0]);
  const e1 = Math.hypot(n[0], n[1]) < 1e-9 ? [1, 0, 0] : nrm(crs([0, 0, 1], n)), e2 = crs(n, e1);
  const toF = (x, y, z) => { const d = [x - c[0], y - c[1], z - c[2]]; return [d[0] * e1[0] + d[1] * e1[1] + d[2] * e1[2], d[0] * e2[0] + d[1] * e2[1] + d[2] * e2[2], d[0] * n[0] + d[1] * n[1] + d[2] * n[2]]; };
  const fromF = (u, v, w) => [c[0] + u * e1[0] + v * e2[0] + w * n[0], c[1] + u * e1[1] + v * e2[1] + w * n[1], c[2] + u * e1[2] + v * e2[2] + w * n[2]];
  // footprint boxes in the frame; the grid covers their overlap
  const box = (P) => { let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity, w0 = Infinity, w1 = -Infinity; for (let i = 0; i < P.length; i += 3) { const [u, v, w] = toF(P[i], P[i + 1], P[i + 2]); u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); w0 = Math.min(w0, w); w1 = Math.max(w1, w); } return { u0, u1, v0, v1, w0, w1 }; };
  const bh = box(hw.positions), bf = box(fw.positions);
  // the overlap, nudged a hair inside: a node exactly on a wall's edge can miss it by rounding (a lost ring of cells)
  const eps = 1e-7 * Math.max(bh.u1 - bh.u0, bh.v1 - bh.v0, 1);
  const U0 = Math.max(bh.u0, bf.u0) + eps, U1 = Math.min(bh.u1, bf.u1) - eps, V0 = Math.max(bh.v0, bf.v0) + eps, V1 = Math.min(bh.v1, bf.v1) - eps;
  if (!(U1 > U0 && V1 > V0)) throw new Error("NO_OVERLAP");
  const cell = Math.max(U1 - U0, V1 - V0) / Math.max(4, cells);
  const nu = Math.max(2, Math.round((U1 - U0) / cell) + 1), nv = Math.max(2, Math.round((V1 - V0) / cell) + 1);
  const du = (U1 - U0) / (nu - 1), dv = (V1 - V0) / (nv - 1);
  const W = Math.max(Math.abs(bh.w0), Math.abs(bh.w1), Math.abs(bf.w0), Math.abs(bf.w1)) * 2 + 10;
  // 2. sample each wall along the pole
  const qh = buildMeshQuery(hw.positions, hw.indices), qf = buildMeshQuery(fw.positions, fw.indices);
  const sample = (q, u, v) => {
    const a = fromF(u, v, -W), b = fromF(u, v, W);
    const hits = segmentIntersections(q, { x: a[0], y: a[1], z: a[2] }, { x: b[0], y: b[1], z: b[2] });
    return hits.length ? -W + 2 * W * hits[0] : NaN; // the first crossing from the footwall side
  };
  const wh = new Float64Array(nu * nv), wf = new Float64Array(nu * nv);
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const u = U0 + i * du, v = V0 + j * dv, k = j * nu + i; wh[k] = sample(qh, u, v); wf[k] = sample(qf, u, v); }
  // which side of the frame is the hangingwall: the wall with the larger mean w
  let sh = 0, sf = 0, m = 0;
  for (let k = 0; k < wh.length; k++) if (wh[k] === wh[k] && wf[k] === wf[k]) { sh += wh[k]; sf += wf[k]; m++; }
  if (!m) throw new Error("NO_OVERLAP");
  const up = sh >= sf ? 1 : -1; // thickness = (wh - wf) * up
  // 3. nodes: both walls hit and the hangingwall above the footwall
  let pinched = 0, tMin = Infinity, tMax = 0, tSum = 0, tN = 0;
  const top = wh, bot = wf, use = new Uint8Array(nu * nv);
  for (let k = 0; k < wh.length; k++) {
    if (!(wh[k] === wh[k] && wf[k] === wf[k])) continue;
    const t = (wh[k] - wf[k]) * up;
    if (!(t > 1e-6)) { pinched++; continue; }
    use[k] = 1; tMin = Math.min(tMin, t); tMax = Math.max(tMax, t); tSum += t; tN++;
  }
  const ok = (i, j) => use[j * nu + i] === 1;
  const cellIn = (i, j) => i >= 0 && j >= 0 && i < nu - 1 && j < nv - 1 && ok(i, j) && ok(i + 1, j) && ok(i, j + 1) && ok(i + 1, j + 1);
  // vertices: a top and a bottom copy of every node used
  const positions = [], vt = new Int32Array(nu * nv).fill(-1), vb = new Int32Array(nu * nv).fill(-1);
  const vid = (arr, w, i, j) => { const k = j * nu + i; if (arr[k] < 0) { arr[k] = positions.length / 3; positions.push(...fromF(U0 + i * du, V0 + j * dv, w[k])); } return arr[k]; };
  const indices = [];
  let nCells = 0;
  for (let j = 0; j < nv - 1; j++) for (let i = 0; i < nu - 1; i++) {
    if (!cellIn(i, j)) continue;
    nCells++;
    const T = [vid(vt, top, i, j), vid(vt, top, i + 1, j), vid(vt, top, i + 1, j + 1), vid(vt, top, i, j + 1)];
    const B = [vid(vb, bot, i, j), vid(vb, bot, i + 1, j), vid(vb, bot, i + 1, j + 1), vid(vb, bot, i, j + 1)];
    indices.push(T[0], T[1], T[2], T[0], T[2], T[3]); // top
    indices.push(B[0], B[2], B[1], B[0], B[3], B[2]); // bottom, reversed
    // 4. walls on edges facing a cell that is not in: edge (a -> b) along the cell's counter-clockwise boundary
    const sides = [[0, 1, i, j - 1], [1, 2, i + 1, j], [2, 3, i, j + 1], [3, 0, i - 1, j]];
    for (const [a, b, ni, nj] of sides) if (!cellIn(ni, nj)) indices.push(T[a], B[a], B[b], T[a], B[b], T[b]);
  }
  if (!nCells) throw new Error("NO_OVERLAP");
  // orient outward (signed volume about the first vertex)
  let v6 = 0;
  const o = positions.slice(0, 3);
  for (let t = 0; t < indices.length; t += 3) {
    const [a, b, cc] = [indices[t], indices[t + 1], indices[t + 2]].map((q) => [positions[3 * q] - o[0], positions[3 * q + 1] - o[1], positions[3 * q + 2] - o[2]]);
    v6 += a[0] * (b[1] * cc[2] - b[2] * cc[1]) + a[1] * (b[2] * cc[0] - b[0] * cc[2]) + a[2] * (b[0] * cc[1] - b[1] * cc[0]);
  }
  if (v6 < 0) { for (let t = 0; t < indices.length; t += 3) { const x = indices[t + 1]; indices[t + 1] = indices[t + 2]; indices[t + 2] = x; } v6 = -v6; }
  const pole = n[2] < 0 ? n.map((x) => -x) : n, dip = (Math.acos(Math.min(1, Math.abs(pole[2]))) * 180) / Math.PI;
  let dipDir = (Math.atan2(pole[0], pole[1]) * 180) / Math.PI; if (dipDir < 0) dipDir += 360;
  return {
    positions: Float64Array.from(positions), indices: Uint32Array.from(indices), volume: v6 / 6,
    thickness: { min: tMin, max: tMax, mean: tN ? tSum / tN : 0 }, pinchedNodes: pinched, nodes: tN, cells: nCells, cellM: Math.min(du, dv), dip, dipDir,
  };
}
