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
const NEAREST_FOR = 3;
const NO_CELLS = [];
// the 27 bins round a composite's own, its own first (#3008)
const BIN_ORDER = [[0, 0, 0]];
for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) if (i || j || k) BIN_ORDER.push([i, j, k]); // TASKS.csv #2547 — the message lists the first three
// TASKS.csv #2456 (review #2325) — bounds: the estimate's grid box; only composites inside it (plus one cell) are checked, so 'Fit to the
// checked holes' no longer warns about '269 of the 294 highest composites' hundreds of metres outside the grid. outsideGrid: how many
// of the highest composites (ranked over all of them) lie outside, to say so. Without bounds the result is as before.
// TASKS.csv #3105 — the k highest by value, highest first, exactly as a stable sort's first k (ties keep their order): the k-th value found by
// selection on a copy of the values, then only those k sorted. A whole-field run sorted all 147,601 composites by value with a comparator
// (about 150 ms of its last main-thread task) to keep the top 5 %.
function topByValue(list, k) {
  const n = list.length;
  if (k >= n) return list.slice().sort((a, b) => b.value - a.value);
  if (k <= 0) return [];
  const v = new Float64Array(n);
  for (let i = 0; i < n; i++) v[i] = list[i].value;
  // quickselect for the k-th largest (index k - 1 in descending order)
  let lo = 0, hi = n - 1; const want = k - 1;
  while (hi > lo) {
    const pv = v[(lo + hi) >> 1];
    let i = lo, j = hi;
    while (i <= j) { while (v[i] > pv) i++; while (v[j] < pv) j--; if (i <= j) { const t = v[i]; v[i] = v[j]; v[j] = t; i++; j--; } }
    if (want <= j) hi = j; else if (want >= i) lo = i; else break;
  }
  const t = v[want];
  let above = 0; for (let i = 0; i < n; i++) if (list[i].value > t) above++;
  const out = []; let ties = k - above;
  for (let i = 0; i < n; i++) { const x = list[i]; if (x.value > t) out.push(x); else if (x.value === t && ties > 0) { out.push(x); ties--; } }
  return out.sort((a, b) => b.value - a.value); // stable: equal values keep the input order, as the full sort did
}
export function topCompositesWithoutBlocks(composites, cells, cellSize, { share = 0.05, min = 3, bounds = null } = {}) {
  const finite = (composites || []).filter((c) => Number.isFinite(c.value));
  const inGrid = (c) => !bounds || (c.x >= bounds.xmin - cellSize && c.x <= bounds.xmax + cellSize && c.y >= bounds.ymin - cellSize && c.y <= bounds.ymax + cellSize && c.z >= bounds.zmin - cellSize && c.z <= bounds.zmax + cellSize);
  const inside = bounds ? finite.filter(inGrid) : finite;
  const outsideGrid = bounds ? topByValue(finite, Math.min(finite.length, Math.max(min, Math.ceil(share * finite.length)))).filter((c) => !inGrid(c)).length : 0; // #3105
  const n = Math.min(inside.length, Math.max(min, Math.ceil(share * inside.length)));
  const top = topByValue(inside, n), reachM = Math.sqrt(3) * cellSize; // #3105 — the top n, not a sort of every composite
  // a coarse hash of the cells, so each composite looks only at the cells of its own and the neighbouring bins
  // TASKS.csv #2547 — numeric bucket keys (string keys for 90,000 blocks cost ~100 ms)
  const bin = Math.max(1e-6, reachM), c0 = (cells || [])[0] || { x: 0, y: 0, z: 0 }, ox = Math.floor(c0.x / bin), oy = Math.floor(c0.y / bin), oz = Math.floor(c0.z / bin), O = 131072, key = (i, j, k) => ((i - ox + O) * 262144 + (j - oy + O)) * 262144 + (k - oz + O); // indices relative to the first cell: exact below 2^53
  const buckets = new Map();
  for (const c of cells || []) {
    const i = Math.floor(c.x / bin), j = Math.floor(c.y / bin), k = Math.floor(c.z / bin), kk = key(i, j, k);
    const l = buckets.get(kk); if (l) l.push(c); else buckets.set(kk, [c]);
  }
  const unsupported = [];
  // TASKS.csv #3008 (WA iron review) — 7,350 top composites x ~1,700 flat 25 x 25 x 2 m cells in the 27 bins round each (Math.hypot) took
  // 3.3 s on the main thread after a whole-field run: a block within reach is all a supported composite needs, so the search stops at the
  // first one, its own bin first; distances by sqrt (Math.hypot is slow in V8)
  const r2 = reachM * reachM;
  for (const c of top) {
    let best = Infinity, near = false;
    const bx = Math.floor(c.x / bin), by = Math.floor(c.y / bin), bz = Math.floor(c.z / bin);
    for (const [i, j, k] of BIN_ORDER) {
      for (const cell of buckets.get(key(bx + i, by + j, bz + k)) || NO_CELLS) { const d2 = (cell.x - c.x) ** 2 + (cell.y - c.y) ** 2 + (cell.z - c.z) ** 2; if (d2 <= r2) { near = true; break; } if (d2 < best) best = d2; }
      if (near) break;
    }
    best = near ? 0 : Math.sqrt(best);
    if (!(best <= reachM)) {
      // the true nearest, for the message, which names the first three (they come highest first): a full scan for those only. The scan per
      // failure was 1,070 x 90,000 distances on the review's project (#2547); the others keep nearestM null
      if (unsupported.length < NEAREST_FOR) for (const cell of cells || []) { const d = Math.hypot(cell.x - c.x, cell.y - c.y, cell.z - c.z); if (d < best) best = d; }
      else best = Infinity;
      unsupported.push({ value: c.value, hole_id: c.hole_id ?? null, nearestM: Number.isFinite(best) ? best : null });
    }
  }
  return { checked: n, unsupported, reachM, ...(bounds ? { outsideGrid } : {}) };
}
