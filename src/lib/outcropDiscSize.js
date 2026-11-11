// TASKS.csv #2412 (review #2325, WA uranium) — outcrop discs started at a fixed 25 m with a 200 m ceiling: on a 10 x 10 km block, 20 bedding
// readings 1 km apart were single pixels at Fit, and 10 px dots at the maximum. The first size comes from the data: about a quarter of the
// median nearest-neighbour spacing of the set (rounded to 5 m, at least 5); the slider's ceiling grows with the set's extent.

const near = (pts) => {
  const d = [];
  for (let i = 0; i < pts.length; i++) {
    let best = Infinity;
    for (let j = 0; j < pts.length; j++) if (j !== i) { const q = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y); if (q > 0 && q < best) best = q; }
    if (Number.isFinite(best)) d.push(best);
  }
  return d.sort((a, b) => a - b);
};

// rows: [{ x, y }] -> the first disc size in metres; 25 (the old default) when the set has fewer than two distinct places
export function defaultDiscSize(rows, { cap = 2000 } = {}) {
  const pts = (rows || []).filter((r) => Number.isFinite(r?.x) && Number.isFinite(r?.y)).slice(0, 3000); // O(n²): the first 3,000 are plenty
  const d = near(pts);
  if (!d.length) return 25;
  const med = d[d.length >> 1];
  return Math.min(cap, Math.max(5, Math.round(med / 4 / 5) * 5));
}

// the slider's ceiling: 200 m as before, or a tenth of the set's larger extent when that is more (rounded up to 50 m)
export function discSizeMax(rows, size = 0) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rows || []) { if (!Number.isFinite(r?.x) || !Number.isFinite(r?.y)) continue; x0 = Math.min(x0, r.x); x1 = Math.max(x1, r.x); y0 = Math.min(y0, r.y); y1 = Math.max(y1, r.y); }
  const ext = Number.isFinite(x0) ? Math.max(x1 - x0, y1 - y0) : 0;
  return Math.max(200, Math.ceil(ext / 10 / 50) * 50, Math.ceil((Number(size) || 0) / 50) * 50);
}
