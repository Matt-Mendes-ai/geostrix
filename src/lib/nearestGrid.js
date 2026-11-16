// TASKS.csv #3803 / #3811 (Scottie Gold review) — the nearest other point of a sample of points, through a uniform grid instead of a scan of every
// point: the survey checks of the Inversion pane, Grid to raster and Sample along the drillholes each scanned all 213,270 points of an IP cloud for
// each of 400 sampled points (85 million distances, and a String() of a line name for each when the readings are on lines), and the window froze
// 9 s on choosing the survey. Exact: the same nearest distance as the full scan (a ring of cells is searched until no closer point can lie further out).
// Pure.

// xs, ys: the coordinates (arrays or typed arrays). -> an index: { cell, x0, y0, nx, ny, start, order }
export function buildNearestGrid(xs, ys) {
  const n = xs.length;
  let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
  for (let i = 0; i < n; i++) { const x = xs[i], y = ys[i]; if (!(Number.isFinite(x) && Number.isFinite(y))) continue; if (x < xmin) xmin = x; if (x > xmax) xmax = x; if (y < ymin) ymin = y; if (y > ymax) ymax = y; }
  if (!Number.isFinite(xmin)) return null;
  const w = Math.max(xmax - xmin, 1e-9), h = Math.max(ymax - ymin, 1e-9);
  // about two points a cell on average, at most 4 million cells
  const cells = Math.min(4e6, Math.max(1, Math.ceil(n / 2)));
  let cell = Math.sqrt((w * h) / cells);
  if (!(cell > 0)) cell = Math.max(w, h) / Math.max(1, Math.sqrt(cells));
  const nx = Math.max(1, Math.min(4096, Math.ceil(w / cell) + 1)), ny = Math.max(1, Math.min(4096, Math.ceil(h / cell) + 1));
  const cx = w / Math.max(1, nx - 1) || cell, cy = h / Math.max(1, ny - 1) || cell, size = Math.max(cx, cy, 1e-9);
  const key = new Int32Array(n), count = new Int32Array(nx * ny + 1);
  for (let i = 0; i < n; i++) {
    const x = xs[i], y = ys[i];
    if (!(Number.isFinite(x) && Number.isFinite(y))) { key[i] = -1; continue; }
    const k = Math.min(ny - 1, Math.floor((y - ymin) / size)) * nx + Math.min(nx - 1, Math.floor((x - xmin) / size));
    key[i] = k; count[k + 1]++;
  }
  for (let k = 0; k < nx * ny; k++) count[k + 1] += count[k];
  const start = count, fill = Int32Array.from(count.subarray(0, nx * ny)), order = new Int32Array(n);
  for (let i = 0; i < n; i++) if (key[i] >= 0) order[fill[key[i]]++] = i;
  return { size, x0: xmin, y0: ymin, nx, ny, start, order, xs, ys };
}

// the distance from point i to its nearest other point at a distance above 0 (a repeat at the same place is not a neighbour), skipping points
// for which skip(j) is true (another reading of the same line). -> metres, or Infinity
export function nearestOther(G, i, skip = null) {
  const { size, x0, y0, nx, ny, start, order, xs, ys } = G;
  const px = xs[i], py = ys[i];
  const ci = Math.min(nx - 1, Math.max(0, Math.floor((px - x0) / size))), cj = Math.min(ny - 1, Math.max(0, Math.floor((py - y0) / size)));
  let best = Infinity;
  const maxR = Math.max(nx, ny);
  for (let r = 0; r <= maxR; r++) {
    // every cell of ring r; a point in ring r is at least (r - 1) * size away
    if (best < Infinity && (r - 1) * size > Math.sqrt(best)) break;
    for (let dj = -r; dj <= r; dj++) {
      const j = cj + dj; if (j < 0 || j >= ny) continue;
      const step = dj === -r || dj === r ? 1 : 2 * r || 1;
      for (let di = -r; di <= r; di += step) {
        const c = ci + di; if (c < 0 || c >= nx) continue;
        const k = j * nx + c;
        for (let s = start[k]; s < start[k + 1]; s++) {
          const q = order[s];
          if (q === i || (skip && skip(q))) continue;
          const d = (xs[q] - px) ** 2 + (ys[q] - py) ** 2;
          if (d > 0 && d < best) best = d;
        }
      }
    }
  }
  return Math.sqrt(best);
}

// the stride sample the callers have always used: `sample` points spread through the array (all of them when there are fewer)
export const strideSample = (n, sample) => (n <= sample ? Array.from({ length: n }, (_, i) => i) : Array.from({ length: sample }, (_, k) => Math.floor((k * n) / sample)));

// the K nearest other points of point i at a distance above 0, nearest first, through the same grid. -> { q: Float64Array (squared distances), idx: Int32Array, m }
export function kNearest(G, i, K) {
  const { size, x0, y0, nx, ny, start, order, xs, ys } = G;
  const px = xs[i], py = ys[i];
  const ci = Math.min(nx - 1, Math.max(0, Math.floor((px - x0) / size))), cj = Math.min(ny - 1, Math.max(0, Math.floor((py - y0) / size)));
  const nq = new Float64Array(K).fill(Infinity), ni = new Int32Array(K).fill(-1);
  let m = 0;
  const maxR = Math.max(nx, ny);
  for (let r = 0; r <= maxR; r++) {
    if (m === K && (r - 1) * size > Math.sqrt(nq[K - 1])) break;
    for (let dj = -r; dj <= r; dj++) {
      const j = cj + dj; if (j < 0 || j >= ny) continue;
      const step = dj === -r || dj === r ? 1 : 2 * r || 1;
      for (let di = -r; di <= r; di += step) {
        const c = ci + di; if (c < 0 || c >= nx) continue;
        const k = j * nx + c;
        for (let s = start[k]; s < start[k + 1]; s++) {
          const qi = order[s];
          if (qi === i) continue;
          const q = (xs[qi] - px) ** 2 + (ys[qi] - py) ** 2;
          if (!(q > 0) || (m === K && q >= nq[K - 1])) continue;
          let t = m < K ? m++ : K - 1;
          while (t > 0 && nq[t - 1] > q) { nq[t] = nq[t - 1]; ni[t] = ni[t - 1]; t--; }
          nq[t] = q; ni[t] = qi;
        }
      }
    }
  }
  return { q: nq, idx: ni, m };
}
