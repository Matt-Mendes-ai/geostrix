// TASKS.csv #1346 — how big a surface sample is drawn. #849 made it 1/250 of the program's extent so a regional stream program is
// visible at all; but a project with soils at 20 m and a few rocks 45 km away (the Silvertip sample) then drew every soil as a
// 250 m ball that buried the drillholes. Each medium is now also capped at 0.4 of its own typical spacing (median distance to the
// nearest sample of that medium), so neighbouring symbols never merge; a sparse regional program keeps its #849 size. Pure.
const MIN_R = 1.8;

// median nearest-neighbour distance of [x, y] points, on a grid (exact for the points it checks; at most 3,000 of them)
function medianSpacing(pts) {
  const n = pts.length;
  if (n < 2) return Infinity;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const cell = Math.max(1e-6, Math.hypot(x1 - x0, y1 - y0) / Math.sqrt(n)), grid = new Map(), key = (i, j) => i * 1e7 + j;
  pts.forEach((p, k) => { const kk = key(Math.floor((p[0] - x0) / cell), Math.floor((p[1] - y0) / cell)); (grid.get(kk) || grid.set(kk, []).get(kk)).push(k); });
  const step = Math.max(1, Math.floor(n / 3000)), d = [];
  for (let k = 0; k < n; k += step) {
    const [x, y] = pts[k], ci = Math.floor((x - x0) / cell), cj = Math.floor((y - y0) / cell);
    let best = Infinity;
    for (let r = 1; r < 1e4; r++) { // rings of cells until one can no longer hold anything nearer
      for (let i = ci - r; i <= ci + r; i++) for (let j = cj - r; j <= cj + r; j++) {
        for (const q of grid.get(key(i, j)) || []) { if (q === k) continue; const dd = Math.hypot(pts[q][0] - x, pts[q][1] - y); if (dd > 0 && dd < best) best = dd; }
      }
      if (best <= r * cell) break;
    }
    if (Number.isFinite(best)) d.push(best);
  }
  if (!d.length) return Infinity;
  d.sort((a, b) => a - b);
  return d[d.length >> 1];
}

// samples: [{ x, y, medium }] -> (medium) => radius in metres
export function symbolRadiusByMedium(samples) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  const by = new Map();
  for (const s of samples) {
    if (!Number.isFinite(s.x) || !Number.isFinite(s.y)) continue;
    if (s.x < x0) x0 = s.x; if (s.x > x1) x1 = s.x; if (s.y < y0) y0 = s.y; if (s.y > y1) y1 = s.y;
    (by.get(s.medium) || by.set(s.medium, []).get(s.medium)).push([s.x, s.y]);
  }
  const extentR = Number.isFinite(x0) ? Math.max(MIN_R, Math.hypot(x1 - x0, y1 - y0) / 250) : MIN_R;
  const r = new Map();
  by.forEach((pts, m) => r.set(m, Math.max(MIN_R, Math.min(extentR, 0.4 * medianSpacing(pts)))));
  return (medium) => r.get(medium) ?? extentR;
}
