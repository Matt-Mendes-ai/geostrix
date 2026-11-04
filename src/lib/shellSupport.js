// TASKS.csv #1735 (review #1645, Copley) — does a grade shell or an estimate actually contain the samples it was built to
// show? With the default two-hole rule on holes 100-1,350 m apart, the "Cu > 1000 ppm" shell closed 90-110 m from the only
// Cu intercept and held no composite at all, and Grade-tonnage then quoted 106 kt from those blocks. These two checks say
// so, in numbers, after every run. Pure: no React, no three.js.

// The at/above-cutoff sample points against the gridded field the shell is the iso-surface of: a point is inside the shell
// when the grid node nearest to it is at/above the cutoff (NaN: the node was not estimated, so the point is outside).
// points: [{ x, y, z, value }] in the GRID's frame (the warped one under a trend); grid: { origin, cellSize: { dx, dy, dz },
// nx, ny, nz }; values: the field. -> { above, inside, outside, noData }
export function samplesInsideShell(points, grid, values, cutoff) {
  const out = { above: 0, inside: 0, outside: 0, noData: 0 };
  const { origin, cellSize: cs, nx, ny, nz } = grid;
  const clamp = (n, hi) => (n < 0 ? 0 : n > hi ? hi : n);
  for (const p of points || []) {
    if (!(p.value >= cutoff)) continue;
    out.above++;
    const gx = clamp(Math.round((p.x - origin.x) / cs.dx), nx - 1), gy = clamp(Math.round((p.y - origin.y) / cs.dy), ny - 1), gz = clamp(Math.round((p.z - origin.z) / cs.dz), nz - 1);
    const v = values[gx + nx * (gy + ny * gz)];
    if (!Number.isFinite(v)) out.noData++;
    else if (v >= cutoff) out.inside++;
    else out.outside++;
  }
  return out;
}

// The highest composites (the top `share` by value, at least `min` of them) and whether an estimated block lies within one
// cell of each: a block model whose rule removed every block round the discovery intercept has nothing near its top
// composites. composites: [{ x, y, z, value, hole_id? }]; cells: [{ x, y, z }] (centres); cellSize: m (the diagonal is the reach).
// -> { checked, unsupported: [{ value, hole_id, nearestM }] (sorted by value, highest first), reachM }
export function topCompositesWithoutBlocks(composites, cells, cellSize, { share = 0.05, min = 3 } = {}) {
  const sorted = (composites || []).filter((c) => Number.isFinite(c.value)).sort((a, b) => b.value - a.value);
  const n = Math.min(sorted.length, Math.max(min, Math.ceil(share * sorted.length)));
  const top = sorted.slice(0, n), reachM = Math.sqrt(3) * cellSize;
  // a coarse hash of the cells, so each composite looks only at the cells of its own and the neighbouring bins
  const bin = Math.max(1e-6, reachM), key = (x, y, z) => `${Math.floor(x / bin)},${Math.floor(y / bin)},${Math.floor(z / bin)}`;
  const buckets = new Map();
  for (const c of cells || []) { const k = key(c.x, c.y, c.z); if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(c); }
  const unsupported = [];
  for (const c of top) {
    let best = Infinity;
    const bx = Math.floor(c.x / bin), by = Math.floor(c.y / bin), bz = Math.floor(c.z / bin);
    for (let i = -1; i <= 1 && best > reachM; i++) for (let j = -1; j <= 1 && best > reachM; j++) for (let k = -1; k <= 1 && best > reachM; k++) {
      for (const cell of buckets.get(`${bx + i},${by + j},${bz + k}`) || []) { const d = Math.hypot(cell.x - c.x, cell.y - c.y, cell.z - c.z); if (d < best) best = d; }
    }
    if (!(best <= reachM)) {
      // the true nearest, for the message (a full scan only for the few that failed)
      for (const cell of cells || []) { const d = Math.hypot(cell.x - c.x, cell.y - c.y, cell.z - c.z); if (d < best) best = d; }
      unsupported.push({ value: c.value, hole_id: c.hole_id ?? null, nearestM: Number.isFinite(best) ? best : null });
    }
  }
  return { checked: n, unsupported, reachM };
}
