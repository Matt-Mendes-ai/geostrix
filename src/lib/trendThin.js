// TASKS.csv #2779 (split from #2428) — structural trend ratios accept any size (200 : 200 : 1) without a word. A search long enough to
// reach the next drill site in every direction of the trend's plane has its intermediate axis at the drill spacing, so it is
// spacing x min / int thick across the plane. When that is less than a typical sample, a block sees only the samples within that
// distance of its own plane in each hole: one or none.

// The median sample length of interval rows ({ from, to }), from at most `cap` rows spread evenly through the list; null with none
export function medianSampleLength(rows, cap = 4000) {
  const n = (rows || []).length;
  if (!n) return null;
  const step = Math.max(1, Math.floor(n / cap)), out = [];
  for (let i = 0; i < n; i += step) { const r = rows[i], l = Number(r?.to) - Number(r?.from); if (Number.isFinite(l) && l > 0) out.push(l); }
  if (!out.length) return null;
  out.sort((a, b) => a - b);
  return out[out.length >> 1];
}

// -> { spacingM, thickM, sampleM } when the search across the plane is thinner than a typical sample, else null
export function trendThinness(ratios, spacingM, sampleM) {
  const int = Number(ratios?.int), min = Number(ratios?.min);
  if (!(spacingM > 0) || !(sampleM > 0) || !(int > 0) || !(min > 0)) return null;
  const thickM = (spacingM * min) / int;
  return thickM < sampleM ? { spacingM, thickM, sampleM } : null;
}

// The median distance from a drill site to the nearest other one; collars within padM of a site are that site (a fan from one pad).
// Grid-hashed, so 8,000 collars take milliseconds (lib/holeSpacing.js's summary compares every pair). null with fewer than 2 sites.
export function medianSiteSpacing(collars, padM = 5) {
  const key = (i, j) => i * 73856093 ^ j * 19349663;
  const pad = new Map(), sx = [], sy = [];
  for (const c of collars || []) {
    const x = Number(c?.x), y = Number(c?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const ci = Math.floor(x / padM), cj = Math.floor(y / padM);
    let near = false;
    for (let di = -1; di <= 1 && !near; di++) for (let dj = -1; dj <= 1 && !near; dj++) for (const k of pad.get(key(ci + di, cj + dj)) || []) if (Math.hypot(sx[k] - x, sy[k] - y) <= padM) { near = true; break; }
    if (near) continue;
    const k = sx.length; sx.push(x); sy.push(y);
    const kk = key(ci, cj); if (pad.has(kk)) pad.get(kk).push(k); else pad.set(kk, [k]);
  }
  const n = sx.length;
  if (n < 2) return null;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let k = 0; k < n; k++) { if (sx[k] < x0) x0 = sx[k]; if (sx[k] > x1) x1 = sx[k]; if (sy[k] < y0) y0 = sy[k]; if (sy[k] > y1) y1 = sy[k]; }
  const g = Math.max(padM, Math.sqrt(Math.max(1, (x1 - x0) * (y1 - y0)) / n));
  const grid = new Map();
  for (let k = 0; k < n; k++) { const kk = key(Math.floor(sx[k] / g), Math.floor(sy[k] / g)); if (grid.has(kk)) grid.get(kk).push(k); else grid.set(kk, [k]); }
  const span = Math.ceil(Math.max(x1 - x0, y1 - y0) / g) + 1;
  const nn = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    const ci = Math.floor(sx[k] / g), cj = Math.floor(sy[k] / g);
    let best = Infinity;
    for (let r = 0; r <= span; r++) {
      if ((r - 1) * g > best) break; // every cell of this ring is farther than the best found
      for (let di = -r; di <= r; di++) for (let dj = -r; dj <= r; dj++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        for (const m of grid.get(key(ci + di, cj + dj)) || []) { if (m === k) continue; const d = Math.hypot(sx[m] - sx[k], sy[m] - sy[k]); if (d < best) best = d; }
      }
    }
    nn[k] = best;
  }
  nn.sort();
  return nn[n >> 1];
}

// The project's drill spacing (the median distance from a drill site to the next) and its median sample length, for trendThinness
export function trendContext(collars, assays, intervals) {
  return { spacingM: medianSiteSpacing(collars), sampleM: medianSampleLength((assays || []).length ? assays : intervals) };
}
