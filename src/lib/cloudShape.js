// TASKS.csv #1783 (review #1646, Kodiak) — is a point survey a surface survey or a 3D point cloud? A 3D inversion model imported as
// points (Kodiak's AMT FEMTIC model: 22,024 nodes from -100 to 1,654 m) was gridded as a map, every depth mixed into one cell, and
// declustered as if it lay on the ground. A surface survey's z follows the terrain, so within a small plan cell its elevations
// spread by little more than the slope; a 3D cloud spreads by hundreds of metres. The median, over plan cells 3 spacings wide, of
// (elevation spread / cell width) tells them apart. -> { n, withZ, zMin, zMax, spacing, spread, is3D } or null (fewer than 20 points)
import { median } from "./arrayStats.js";

export function cloudShape(points, { sample = 2000, ratio = 2 } = {}) {
  const pts = (points || []).filter((p) => Number.isFinite(p?.x) && Number.isFinite(p?.y));
  if (pts.length < 20) return null;
  const zs = pts.filter((p) => Number.isFinite(p.z));
  // the plan spacing: the nearest neighbour of a sample of points, found through a hash grid
  const n = pts.length, step = Math.max(1, Math.floor(n / sample));
  let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
  for (const p of pts) { if (p.x < xmin) xmin = p.x; if (p.x > xmax) xmax = p.x; if (p.y < ymin) ymin = p.y; if (p.y > ymax) ymax = p.y; }
  const guess = Math.max(1e-6, Math.sqrt(((xmax - xmin) * (ymax - ymin)) / n)); // the spacing of an even spread
  const cell = new Map(), key = (x, y) => `${Math.floor(x / guess)},${Math.floor(y / guess)}`;
  pts.forEach((p, i) => { const k = key(p.x, p.y); (cell.get(k) || cell.set(k, []).get(k)).push(i); });
  const dists = [];
  for (let i = 0; i < n; i += step) {
    const p = pts[i], cx = Math.floor(p.x / guess), cy = Math.floor(p.y / guess);
    let best = Infinity;
    for (let r = 1; r <= 3 && best === Infinity; r++) {
      for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) for (const j of cell.get(`${cx + dx},${cy + dy}`) || []) {
        if (j === i) continue; const d = Math.hypot(pts[j].x - p.x, pts[j].y - p.y); if (d > 0 && d < best) best = d;
      }
    }
    if (Number.isFinite(best)) dists.push(best);
  }
  const spacing = dists.length ? median(dists) : guess;
  if (zs.length < 20) return { n, withZ: zs.length, zMin: null, zMax: null, spacing, spread: 0, is3D: false };
  // the elevation spread inside plan cells three spacings wide
  const w = Math.max(1e-6, 3 * spacing), bins = new Map(), bkey = (x, y) => `${Math.floor(x / w)},${Math.floor(y / w)}`;
  let zMin = Infinity, zMax = -Infinity;
  for (const p of zs) { const k = bkey(p.x, p.y); const b = bins.get(k) || bins.set(k, [Infinity, -Infinity]).get(k); if (p.z < b[0]) b[0] = p.z; if (p.z > b[1]) b[1] = p.z; if (p.z < zMin) zMin = p.z; if (p.z > zMax) zMax = p.z; }
  const spreads = [...bins.values()].filter((b) => b[1] > b[0]).map((b) => (b[1] - b[0]) / w);
  const spread = spreads.length ? median(spreads) : 0;
  return { n, withZ: zs.length, zMin, zMax, spacing, spread, is3D: spread > ratio };
}
