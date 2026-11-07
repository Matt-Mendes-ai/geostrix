// TASKS.csv #1622 — natural-neighbour gridding (Sibson 1981) of scattered samples, the third method beside IDW and minimum curvature:
// each node a weighted mean of its natural neighbours, the weights the share of area each sample's Voronoi cell would give up to the
// node. No bullseyes (a lone high is not spread farther than its own neighbours reach), no overshoot (the value always lies between
// the neighbours'), and the sample's value at the sample.
//
// Computed with the discrete Sibson method (Park, Linsen, Kreylos, Owens & Hamann 2006, "Discrete Sibson interpolation", IEEE TVCG
// 12): every node p finds its nearest sample s at distance r, and passes s's value to every node within r of p; each node's value is
// the mean of what it received. It converges to Sibson's interpolant as the cells shrink, and costs about the number of nodes times
// (spacing / cell)^2, estimated first and refused past NATNEIGH_MAX_WORK (a cell much finer than the sample spacing).
// Node layout as idw.js idwGrid: node (i, j) at x = xmin + (i + 0.5) cell, y = ymax - (j + 0.5) cell, index i + nx * j.
import { Delaunay } from "d3-delaunay";

export const NATNEIGH_MAX_WORK = 4e8;

// points: [{ x, y, v }]; active (Uint8Array, optional): only these nodes give and receive (the far field is blanked anyway).
// -> { values: Float64Array (NaN where no node gave), work } or { error: "work", work }
export function naturalNeighbourGrid(points, { xmin, ymax, cell, nx, ny }, { active = null } = {}) {
  // one site per position: samples at the same place averaged (a duplicate would split the Voronoi cell between them)
  const sites = new Map();
  for (const p of points) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.v)) continue;
    const k = `${p.x},${p.y}`, e = sites.get(k);
    if (e) { e.s += p.v; e.n++; } else sites.set(k, { x: p.x, y: p.y, s: p.v, n: 1 });
  }
  const S = [...sites.values()].map((e) => ({ x: e.x, y: e.y, v: e.s / e.n }));
  const N = nx * ny, values = new Float64Array(N).fill(NaN);
  if (!S.length) return { values, work: 0 };
  const del = Delaunay.from(S, (p) => p.x, (p) => p.y);
  const near = new Int32Array(N).fill(-1), rCells = new Float32Array(N);
  let hint = 0, work = 0;
  for (let j = 0; j < ny; j++) {
    const y = ymax - (j + 0.5) * cell;
    for (let i = 0; i < nx; i++) {
      const k = i + nx * j;
      if (active && !active[k]) continue;
      const x = xmin + (i + 0.5) * cell;
      const s = S.length === 1 ? 0 : del.find(x, y, hint);
      hint = s;
      near[k] = s;
      const r = Math.hypot(S[s].x - x, S[s].y - y) / cell;
      rCells[k] = r;
      work += Math.PI * r * r + 1;
    }
  }
  if (work > NATNEIGH_MAX_WORK) return { error: "work", work };
  const sum = new Float64Array(N), cnt = new Uint32Array(N);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = i + nx * j, s = near[k];
    if (s < 0) continue;
    const r = rCells[k], v = S[s].v, r2 = r * r + 1e-9, kr = Math.floor(r);
    for (let dj = -kr; dj <= kr; dj++) {
      const jj = j + dj;
      if (jj < 0 || jj >= ny) continue;
      const w = Math.floor(Math.sqrt(Math.max(0, r2 - dj * dj)));
      const i0 = Math.max(0, i - w), i1 = Math.min(nx - 1, i + w), row = nx * jj;
      for (let ii = i0; ii <= i1; ii++) {
        const q = row + ii;
        if (active && !active[q]) continue;
        sum[q] += v; cnt[q]++;
      }
    }
  }
  for (let k = 0; k < N; k++) {
    if (!cnt[k]) continue;
    // a node on a sample keeps it (the discrete method averages a little of the neighbours in; Sibson's interpolant does not)
    values[k] = rCells[k] < 1e-6 && near[k] >= 0 ? S[near[k]].v : sum[k] / cnt[k];
  }
  return { values, work: Math.round(work) };
}
