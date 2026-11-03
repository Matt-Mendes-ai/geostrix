// TASKS.csv #1449 / #1450 (review #1352, Silvertip) — where the data are. Five rock chips 45 km south of 601 other surface samples
// set a 31 x 56 km evidence grid and a 2.5 km reach for soils taken 25-50 m apart. Points join a group when a neighbour lies within
// `link` metres; a group holding less than `minShare` of the points is an outlier for an extent or a spacing (it stays in the data).
// Grid cells of link/sqrt(2) hold points all within `link` of each other, and two cells whose boxes are within `link` join, so the
// cost is per cell, not per pair of points (a 50,000-sample soil grid stays fast). Cells can join a little beyond `link` (up to a
// cell diagonal): close enough for telling a camp from a sample 45 km away.
// points: [{ x, y }] -> { keep: boolean[] aligned with points, dropped: count of finite points left out }
export function mainClusters(points, { link = 5000, minShare = 0.02 } = {}) {
  const n = points?.length || 0, keep = new Array(n).fill(false);
  const cs = link / Math.SQRT2, cells = new Map();
  for (let i = 0; i < n; i++) {
    const p = points[i];
    if (!Number.isFinite(p?.x) || !Number.isFinite(p?.y)) continue;
    const k = `${Math.floor(p.x / cs)},${Math.floor(p.y / cs)}`;
    if (!cells.has(k)) cells.set(k, []);
    cells.get(k).push(i);
  }
  const keys = [...cells.keys()], parent = new Map(keys.map((k) => [k, k]));
  const find = (k) => { while (parent.get(k) !== k) { parent.set(k, parent.get(parent.get(k))); k = parent.get(k); } return k; };
  for (const k of keys) {
    const [cx, cy] = k.split(",").map(Number);
    for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) {
      if (Math.abs(dx) === 2 && Math.abs(dy) === 2) continue; // boxes a full diagonal apart: farther than link
      const o = `${cx + dx},${cy + dy}`;
      if (cells.has(o)) { const a = find(k), b = find(o); if (a !== b) parent.set(a, b); }
    }
  }
  const size = new Map();
  let total = 0;
  for (const k of keys) { const r = find(k), c = cells.get(k).length; size.set(r, (size.get(r) || 0) + c); total += c; }
  const big = new Set([...size].filter(([, c]) => c >= minShare * total).map(([r]) => r));
  if (!big.size) return { keep: points.map((p) => Number.isFinite(p?.x) && Number.isFinite(p?.y)), dropped: 0 };
  let dropped = 0;
  for (const k of keys) { const inMain = big.has(find(k)); for (const i of cells.get(k)) { keep[i] = inMain; if (!inMain) dropped++; } }
  return { keep, dropped };
}
