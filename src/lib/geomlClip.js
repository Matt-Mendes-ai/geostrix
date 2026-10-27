// TASKS.csv #646 — keep a geoML model where it means something. The add-on fills the whole box around the
// samples, and a Gaussian process far from data just returns its prior; on steep ground that box includes the
// sky over valley pads. On Matt's Treaty Creek project (1,300 m of relief) 47 % and 29 % of the blocks the two
// geoML Au models SHOWED were entirely above the terrain — read as "the model is off in elevation".
// A block is dropped when its centre is above the ground, or when no sample lies within `maxDist` of it (the
// model's range: beyond it the prediction is the prior). The ground is the project's terrain where it covers
// the block, otherwise a surface through the collar elevations (inverse distance, nearest 8).
import { terrainGroundAt } from "./viewer/geomath.js";
import { t as tr } from "./i18n.js"; // TASKS.csv #786 — messages in the interface language

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
      g = inTerrain(x, y) ? terrainGroundAt(terrain, x, y) : NaN; // TASKS.csv #927 — fill falls back to the collars
      if (!Number.isFinite(g)) g = fromCollars(x, y);
      cache.set(k, g);
    }
    return g;
  };
}

// Is any of `points` ([[x, y, z], ...]) within maxDist of (x, y, z)?
// TASKS.csv #738 — buckets of maxDist / 2 with numeric keys (was maxDist-sized buckets keyed by strings, scanning all 27
// neighbours point by point: ~3 s for 100k blocks against 60k samples). A cell's diagonal is 0.87 maxDist, so any
// sample in the block's own cell is close enough; of the 5 x 5 x 5 neighbours, a cell that cannot reach the block is
// skipped, and a non-empty cell lying wholly inside the radius answers without looking at its points.
export function makeNearData(points, maxDist) {
  const s = maxDist / 2, r2 = maxDist * maxDist;
  if (!points.length || !(s > 0)) return () => false;
  let mi = Infinity, mj = Infinity, mk = Infinity, Mi = -Infinity, Mj = -Infinity, Mk = -Infinity;
  const cells = points.map((p) => {
    const i = Math.floor(p[0] / s), j = Math.floor(p[1] / s), k = Math.floor(p[2] / s);
    if (i < mi) mi = i; if (j < mj) mj = j; if (k < mk) mk = k; if (i > Mi) Mi = i; if (j > Mj) Mj = j; if (k > Mk) Mk = k;
    return [i, j, k];
  });
  const NJ = Mj - mj + 1, NK = Mk - mk + 1;
  const key = (i, j, k) => ((i - mi) * NJ + (j - mj)) * NK + (k - mk);
  const b = new Map();
  points.forEach((p, n) => { const kk = key(...cells[n]); let a = b.get(kk); if (!a) b.set(kk, (a = [])); a.push(p[0], p[1], p[2]); });
  // squared distance from a coordinate to the interval [c*s, (c+1)*s] on one axis: nearest and farthest
  const near1 = (v, c) => { const lo = c * s, hi = lo + s; return v < lo ? lo - v : v > hi ? v - hi : 0; };
  const far1 = (v, c) => Math.max(Math.abs(v - c * s), Math.abs(v - (c + 1) * s));
  return (x, y, z) => {
    const i = Math.floor(x / s), j = Math.floor(y / s), k = Math.floor(z / s);
    if (i < mi - 2 || i > Mi + 2 || j < mj - 2 || j > Mj + 2 || k < mk - 2 || k > Mk + 2) return false;
    if (i >= mi && i <= Mi && j >= mj && j <= Mj && k >= mk && k <= Mk && b.has(key(i, j, k))) return true;
    for (let ci = Math.max(i - 2, mi); ci <= Math.min(i + 2, Mi); ci++) {
      const dx = near1(x, ci);
      for (let cj = Math.max(j - 2, mj); cj <= Math.min(j + 2, Mj); cj++) {
        const dy = near1(y, cj); if (dx * dx + dy * dy > r2) continue;
        for (let ck = Math.max(k - 2, mk); ck <= Math.min(k + 2, Mk); ck++) {
          const dz = near1(z, ck); if (dx * dx + dy * dy + dz * dz > r2) continue;
          const a = b.get(key(ci, cj, ck)); if (!a) continue;
          if (far1(x, ci) ** 2 + far1(y, cj) ** 2 + far1(z, ck) ** 2 <= r2) return true;
          for (let n = 0; n < a.length; n += 3) if ((a[n] - x) ** 2 + (a[n + 1] - y) ** 2 + (a[n + 2] - z) ** 2 <= r2) return true;
        }
      }
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

// TASKS.csv #741 — the add-on's block result -> GeoStrix voxel cells, in one place (it was built twice in
// PredictivePanel, and a change to the contract broke both loops with no test). The contract: blocks = { cell (m),
// x, y, z, and per-block value arrays (probability / uncertainty, or prediction / p10 / p90) }, all the same length.
// blockPoints(blocks) -> [{x, y, z}] for clipBlocks; blockCells(blocks, keep, valueAt) -> cells of the kept blocks
// whose valueAt(i) is a finite number.
export function checkBlocks(blocks, fields) {
  const n = blocks?.x?.length;
  const bad = !(Number.isFinite(blocks?.cell) && blocks.cell > 0) || !Number.isInteger(n)
    || ["y", "z", ...fields].some((f) => blocks[f]?.length !== n);
  if (bad) throw new Error(tr("the add-on returned blocks this GeoStrix cannot read (needs cell, x, y, z, {fields} of equal length) — update GeoStrix or the add-on.", { fields: fields.join(", ") }));
  return n;
}
export const blockPoints = (b) => Array.from(b.x, (x, i) => ({ x, y: b.y[i], z: b.z[i] }));
export function blockCells(b, keep, valueAt) {
  const cells = [];
  for (let i = 0; i < b.x.length; i++) {
    if (!keep[i]) continue;
    const value = valueAt(i);
    if (Number.isFinite(value)) cells.push({ x: b.x[i], y: b.y[i], z: b.z[i], dx: b.cell, dy: b.cell, dz: b.cell, value });
  }
  return cells;
}
