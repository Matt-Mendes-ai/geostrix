// TASKS.csv #646 — keep a geoML model where it means something. The add-on fills the whole box around the
// samples, and a Gaussian process far from data just returns its prior; on steep ground that box includes the
// sky over valley pads. On Matt's Treaty Creek project (1,300 m of relief) 47 % and 29 % of the blocks the two
// geoML Au models SHOWED were entirely above the terrain — read as "the model is off in elevation".
// A block is dropped when its centre is above the ground, or when no sample lies within `maxDist` of it (the
// model's range: beyond it the prediction is the prior). The ground is the project's terrain where it covers
// the block, otherwise a surface through the collar elevations (inverse distance, nearest 8).
import { sampleTerrainElevation } from "./viewer/geomath.js";

export function makeGround({ terrain, collars }) {
  const cz = (collars || []).filter((c) => Number.isFinite(c.x) && Number.isFinite(c.y) && Number.isFinite(c.z));
  const inTerrain = (x, y) => {
    if (!terrain?.bbox || !terrain.elevations) return false;
    const [x0, y0, x1, y1] = terrain.bbox;
    return x >= x0 && x <= x1 && y >= y0 && y <= y1;
  };
  const fromCollars = (x, y) => {
    if (!cz.length) return NaN;
    const near = cz.map((c) => [(c.x - x) ** 2 + (c.y - y) ** 2, c.z]).sort((a, b) => a[0] - b[0]).slice(0, 8);
    if (near[0][0] < 1e-6) return near[0][1];
    let sw = 0, sz = 0;
    for (const [d2, z] of near) { const w = 1 / d2; sw += w; sz += w * z; }
    return sz / sw;
  };
  const cache = new Map();
  return (x, y) => {
    const k = `${Math.round(x)}|${Math.round(y)}`;
    let g = cache.get(k);
    if (g === undefined) {
      g = inTerrain(x, y) ? sampleTerrainElevation(terrain, x, y) : NaN;
      if (!Number.isFinite(g)) g = fromCollars(x, y);
      cache.set(k, g);
    }
    return g;
  };
}

// Is any of `points` ([[x, y, z], ...]) within maxDist of (x, y, z)? A bucket grid of maxDist-sized cells.
export function makeNearData(points, maxDist) {
  const s = maxDist, b = new Map(), r2 = maxDist * maxDist;
  const key = (i, j, k) => `${i}|${j}|${k}`;
  for (const p of points) {
    const kk = key(Math.floor(p[0] / s), Math.floor(p[1] / s), Math.floor(p[2] / s));
    let a = b.get(kk); if (!a) b.set(kk, (a = [])); a.push(p);
  }
  return (x, y, z) => {
    const i = Math.floor(x / s), j = Math.floor(y / s), k = Math.floor(z / s);
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) for (let dk = -1; dk <= 1; dk++) {
      const a = b.get(key(i + di, j + dj, k + dk));
      if (a) for (const p of a) if ((p[0] - x) ** 2 + (p[1] - y) ** 2 + (p[2] - z) ** 2 <= r2) return true;
    }
    return false;
  };
}

// keep[i] for block i ({x, y, z}); counts of what was dropped and why (above ground wins when both apply).
export function clipBlocks(blocks, { ground, near }) {
  const keep = new Array(blocks.length);
  let air = 0, far = 0;
  for (let i = 0; i < blocks.length; i++) {
    const c = blocks[i];
    const g = ground ? ground(c.x, c.y) : NaN;
    if (Number.isFinite(g) && c.z > g) { keep[i] = false; air++; continue; }
    if (near && !near(c.x, c.y, c.z)) { keep[i] = false; far++; continue; }
    keep[i] = true;
  }
  return { keep, air, far };
}
