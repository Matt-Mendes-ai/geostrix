// TASKS.csv #873 — the order of surfaces in a stack, top first. Sorting by median elevation mis-orders a dipping top and
// base picked over different footprints (#855 review: top over x 200-800 m and base over 0-600 m, both dipping 30°, 50 m
// apart -> the base's median is the HIGHER one, and Solid blocks coded 320 m of column below the base as the unit).
// Instead each pair is compared where both exist: the sign of the median of zA - zB over the map columns both cover;
// medians only for a pair that shares no column. The stack is then ordered by how many others each lies above (ties: by
// median), which is the geological order whenever the pairwise relations agree. Pure: no three.js.

// heights of a surface on an n x n grid of column centres over box [xmin, xmax, ymin, ymax]: the highest crossing in
// each column (NaN where the surface is absent). positions: x, y (map), z (elevation) triples.
export function heightGrid(positions, indices, box, n) {
  const [x0, x1, y0, y1] = box, dx = (x1 - x0) / n || 1, dy = (y1 - y0) / n || 1;
  const H = new Float64Array(n * n).fill(NaN);
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3, P = positions;
    const ax = P[a], ay = P[a + 1], bx = P[b], by = P[b + 1], cx = P[c], cy = P[c + 1];
    const det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(det) < 1e-12) continue; // vertical or degenerate in plan
    const i0 = Math.max(0, Math.ceil((Math.min(ax, bx, cx) - x0) / dx - 0.5)), i1 = Math.min(n - 1, Math.floor((Math.max(ax, bx, cx) - x0) / dx - 0.5));
    const j0 = Math.max(0, Math.ceil((Math.min(ay, by, cy) - y0) / dy - 0.5)), j1 = Math.min(n - 1, Math.floor((Math.max(ay, by, cy) - y0) / dy - 0.5));
    for (let j = j0; j <= j1; j++) {
      const py = y0 + (j + 0.5) * dy;
      for (let i = i0; i <= i1; i++) {
        const px = x0 + (i + 0.5) * dx;
        const l1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / det, l2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / det, l3 = 1 - l1 - l2;
        if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue;
        const z = l1 * P[a + 2] + l2 * P[b + 2] + l3 * P[c + 2], k = j * n + i;
        if (!(H[k] >= z)) H[k] = z;
      }
    }
  }
  return H;
}

const median = (v) => { if (!v.length) return NaN; const s = [...v].sort((p, q) => p - q); return s[s.length >> 1]; };

// items [{ id, positions, indices }] -> { order: [ids, top first], rank: { id: 0.. }, pairs: number compared on shared columns }
export function stackOrder(items, { n = 48, minShared = 3 } = {}) {
  if (items.length < 2) return { order: items.map((it) => it.id), rank: Object.fromEntries(items.map((it, i) => [it.id, i])), pairs: 0 };
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const it of items) for (let i = 0; i < it.positions.length; i += 3) { const x = it.positions[i], y = it.positions[i + 1]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const box = [x0, x1, y0, y1];
  const G = items.map((it) => heightGrid(it.positions, it.indices, box, n));
  const med = items.map((it) => { const z = []; for (let i = 2; i < it.positions.length; i += 3) z.push(it.positions[i]); return median(z); });
  const wins = items.map(() => 0);
  let pairs = 0;
  for (let a = 0; a < items.length; a++) for (let b = a + 1; b < items.length; b++) {
    const d = [];
    for (let k = 0; k < n * n; k++) { const za = G[a][k], zb = G[b][k]; if (za === za && zb === zb) d.push(za - zb); }
    let s;
    if (d.length >= minShared) { s = Math.sign(median(d)); pairs++; } else s = Math.sign(med[a] - med[b]);
    if (s > 0) wins[a]++; else if (s < 0) wins[b]++;
  }
  const idx = items.map((_, i) => i).sort((p, q) => (wins[q] - wins[p]) || (med[q] - med[p]));
  return { order: idx.map((i) => items[i].id), rank: Object.fromEntries(idx.map((i, r) => [items[i].id, r])), pairs };
}
