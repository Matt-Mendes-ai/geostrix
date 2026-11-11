// TASKS.csv #2596 — a bucket index of 3D points: the nearest point's distance within a radius, and whether any point lies within a
// distance. Used by the estimate to flag the blocks whose nearest drilled metre is unsampled (lib/estimation.js). Buckets of `cell`
// metres on the points' own lattice (numeric keys: no string per lookup); a ring search stops once the next ring cannot hold anything
// nearer. Pure: no DOM.
export function makePointIndex(points, cell) {
  const b = Math.max(1e-3, Number(cell) || 10);
  const pts = (points || []).filter((p) => Number.isFinite(p?.x) && Number.isFinite(p?.y) && Number.isFinite(p?.z));
  const count = pts.length;
  if (!count) return { nearest: () => Infinity, anyWithin: () => false, count };
  let i0 = Infinity, j0 = Infinity, k0 = Infinity, i1 = -Infinity, j1 = -Infinity, k1 = -Infinity;
  for (const p of pts) {
    const i = Math.floor(p.x / b), j = Math.floor(p.y / b), k = Math.floor(p.z / b);
    if (i < i0) i0 = i; if (i > i1) i1 = i; if (j < j0) j0 = j; if (j > j1) j1 = j; if (k < k0) k0 = k; if (k > k1) k1 = k;
  }
  const ni = i1 - i0 + 1, nj = j1 - j0 + 1, nk = k1 - k0 + 1;
  const map = new Map();
  for (const p of pts) {
    const q = ((Math.floor(p.x / b) - i0) * nj + (Math.floor(p.y / b) - j0)) * nk + (Math.floor(p.z / b) - k0);
    (map.get(q) || map.set(q, []).get(q)).push(p);
  }
  // the nearest point's distance, or Infinity when none lies within maxR
  const nearest = (x, y, z, maxR) => {
    const ci = Math.floor(x / b) - i0, cj = Math.floor(y / b) - j0, ck = Math.floor(z / b) - k0;
    let best = Infinity;
    const R = Number.isFinite(maxR) ? maxR : Infinity, maxRing = Number.isFinite(R) ? Math.ceil(R / b) + 1 : Math.max(ni, nj, nk);
    for (let r = 0; r <= maxRing; r++) {
      if ((r - 1) * b > Math.min(best, R)) break; // everything in ring r is at least (r - 1) * b away
      for (let a = Math.max(-r, -ci); a <= Math.min(r, ni - 1 - ci); a++) {
        for (let c = Math.max(-r, -cj); c <= Math.min(r, nj - 1 - cj); c++) {
          const onShell = Math.abs(a) === r || Math.abs(c) === r;
          for (let d = Math.max(-r, -ck); d <= Math.min(r, nk - 1 - ck); d++) {
            if (!onShell && Math.abs(d) !== r) continue;
            const l = map.get(((ci + a) * nj + (cj + c)) * nk + (ck + d));
            if (l) for (const p of l) { const dd = Math.hypot(p.x - x, p.y - y, p.z - z); if (dd < best) best = dd; }
          }
        }
      }
    }
    return best <= R ? best : Infinity;
  };
  const anyWithin = (x, y, z, r) => nearest(x, y, z, r) < r;
  return { nearest, anyWithin, count };
}
