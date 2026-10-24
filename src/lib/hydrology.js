// TASKS.csv #845 — catchments of stream-sediment sites from the project terrain, Hawkes' dilution correction and the
// ranking of drainages. Matt: "Keep going" (#839 build order 4; docs/ideas/soils-stream-sediments.md 5.1-5.4) and
// "Do all stream programs". A stream-sediment sample represents its catchment, not its point (Bonham-Carter, Rogers &
// Ellwood 1987, Journal of Geochemical Exploration 29, 259-278); every tool below needs that polygon.
//
// On the terrain grid (node-based, row 0 = north; store.terrain):
//   1. depressions filled by priority-flood with an epsilon gradient (Barnes, Lehman & Mulla 2014, Computers &
//      Geosciences 62, 117-127), so every cell drains to the grid edge: a DEM's pits are mostly artefacts, and a real
//      lake then drains across its surface - stated, not hidden;
//   2. D8 flow direction, steepest descent to one of the 8 neighbours, diagonal distance included (O'Callaghan &
//      Mark 1984, Computer Vision, Graphics and Image Processing 28, 323-344);
//   3. flow accumulation (contributing cells, from a topological order), streams where the contributing area passes a
//      threshold, Strahler (1957) order;
//   4. each site snapped to the highest-accumulation cell within a radius (GPS positions sit beside the channel on a
//      30 m grid), its whole upstream catchment, and the sub-catchment it alone drains (the area not draining first
//      through another site);
//   5. Hawkes (1976, Journal of Geochemical Exploration 6, 345-358): productivity = (Me - Mb) x A, the excess over
//      background times the catchment area - a modest value from a large catchment can mean a bigger source than a
//      high value from a small one. It assumes uniform erosion and clastic dispersion; it over-corrects large
//      catchments with lakes or flat valleys and does nothing for hydromorphic metals (stated with the ranking);
//   6. follow-up reaches: where a site is anomalous and no site upstream of it is, the channel from the site up to
//      the next sites (or to the stream head) is the one to walk.
// Pure, typed arrays; the heavy part (fill, D8, accumulation) runs in hydrology.worker.js for a big grid.

const DX = [1, 1, 0, -1, -1, -1, 0, 1], DY = [0, 1, 1, 1, 0, -1, -1, -1]; // E, SE, S, SW, W, NW, N, NE (row down = south)

// Binary min-heap keyed by Float64 priority (cell index payload)
class Heap {
  constructor(cap) { this.k = new Float64Array(cap); this.v = new Int32Array(cap); this.n = 0; }
  push(k, v) {
    let i = this.n++;
    if (i >= this.k.length) { const k2 = new Float64Array(this.k.length * 2), v2 = new Int32Array(this.k.length * 2); k2.set(this.k); v2.set(this.v); this.k = k2; this.v = v2; }
    while (i > 0) { const p = (i - 1) >> 1; if (this.k[p] <= k) break; this.k[i] = this.k[p]; this.v[i] = this.v[p]; i = p; }
    this.k[i] = k; this.v[i] = v;
  }
  pop() {
    const top = this.v[0], k = this.k[--this.n], v = this.v[this.n];
    let i = 0;
    for (;;) { let c = 2 * i + 1; if (c >= this.n) break; if (c + 1 < this.n && this.k[c + 1] < this.k[c]) c++; if (this.k[c] >= k) break; this.k[i] = this.k[c]; this.v[i] = this.v[c]; i = c; }
    this.k[i] = k; this.v[i] = v;
    return top;
  }
}

// elevations (Float32Array or array), w, h, isNoData(i) -> Float64Array filled (NaN where no data)
export function fillDepressions(elev, w, h, isNoData = () => false) {
  const n = w * h, z = new Float64Array(n), done = new Uint8Array(n), heap = new Heap(Math.max(16, 2 * (w + h)));
  for (let i = 0; i < n; i++) { const v = elev[i]; z[i] = isNoData(i) || !Number.isFinite(v) ? NaN : v; }
  // seeds: the grid edge and every cell next to no data (water leaves the grid there)
  for (let i = 0; i < n; i++) {
    if (Number.isNaN(z[i])) { done[i] = 1; continue; }
    const x = i % w, y = (i / w) | 0;
    let edge = x === 0 || y === 0 || x === w - 1 || y === h - 1;
    if (!edge) for (let d = 0; d < 8; d++) if (Number.isNaN(z[(y + DY[d]) * w + x + DX[d]])) { edge = true; break; }
    if (edge) { done[i] = 1; heap.push(z[i], i); }
  }
  while (heap.n) {
    const c = heap.pop(), cx = c % w, cy = (c / w) | 0, zc = z[c];
    for (let d = 0; d < 8; d++) {
      const x = cx + DX[d], y = cy + DY[d];
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const j = y * w + x;
      if (done[j]) continue;
      done[j] = 1;
      const next = Math.max(z[j], zc + 1e-6 * (1 + Math.abs(zc) * 1e-6)); // epsilon: a flat filled area still drains
      z[j] = next;
      heap.push(next, j);
    }
  }
  return z;
}

// D8 direction per cell (0-7 into DX/DY, -1 = drains off the grid / no data). cell sizes dx, dy in metres.
export function flowDirections(z, w, h, dx, dy) {
  const n = w * h, dir = new Int8Array(n).fill(-1), dist = DX.map((a, d) => Math.hypot(a * dx, DY[d] * dy));
  for (let i = 0; i < n; i++) {
    const zc = z[i];
    if (Number.isNaN(zc)) continue;
    const cx = i % w, cy = (i / w) | 0;
    let best = -1, bestS = 0;
    for (let d = 0; d < 8; d++) {
      const x = cx + DX[d], y = cy + DY[d];
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const zj = z[y * w + x];
      if (Number.isNaN(zj)) continue;
      const s = (zc - zj) / dist[d];
      if (s > bestS) { bestS = s; best = d; }
    }
    dir[i] = best; // -1: an edge cell with no lower neighbour inside drains off the grid
  }
  return dir;
}
export const downstreamOf = (i, dir, w) => (dir[i] < 0 ? -1 : i + DY[dir[i]] * w + DX[dir[i]]);

// Topological order (sources first) and accumulation (contributing cells incl. itself)
export function accumulate(dir, w, h) {
  const n = w * h, indeg = new Int32Array(n), order = new Int32Array(n), acc = new Float64Array(n);
  for (let i = 0; i < n; i++) { const d = downstreamOf(i, dir, w); if (d >= 0) indeg[d]++; }
  let head = 0, tail = 0;
  for (let i = 0; i < n; i++) if (indeg[i] === 0) order[tail++] = i;
  while (head < tail) { const i = order[head++]; const d = downstreamOf(i, dir, w); if (d >= 0 && --indeg[d] === 0) order[tail++] = d; }
  for (let k = 0; k < tail; k++) { const i = order[k]; acc[i] += 1; const d = downstreamOf(i, dir, w); if (d >= 0) acc[d] += acc[i]; }
  return { order: order.subarray(0, tail), acc };
}

// Strahler order of stream cells (acc >= minCells), 0 elsewhere
export function strahler(dir, acc, order, w, minCells) {
  const n = dir.length, so = new Uint8Array(n), maxIn = new Uint8Array(n), cntMax = new Uint8Array(n);
  for (let k = 0; k < order.length; k++) {
    const i = order[k];
    if (acc[i] < minCells) continue;
    so[i] = maxIn[i] === 0 ? 1 : cntMax[i] >= 2 ? maxIn[i] + 1 : maxIn[i];
    const d = downstreamOf(i, dir, w);
    if (d < 0 || acc[d] < minCells) continue;
    if (so[i] > maxIn[d]) { maxIn[d] = so[i]; cntMax[d] = 1; } else if (so[i] === maxIn[d]) cntMax[d]++;
  }
  return so;
}

// grid <-> world (node-based, row 0 = ymax)
export function gridGeometry(terrain) {
  const [xmin, ymin, xmax, ymax] = terrain.bbox, w = terrain.gridW, h = terrain.gridH;
  const dx = (xmax - xmin) / Math.max(1, w - 1), dy = (ymax - ymin) / Math.max(1, h - 1);
  return { w, h, dx, dy, xmin, ymax, toIndex: (x, y) => { const i = Math.round((x - xmin) / dx), j = Math.round((ymax - y) / dy); return i < 0 || j < 0 || i >= w || j >= h ? -1 : j * w + i; }, toXY: (k) => [xmin + (k % w) * dx, ymax - ((k / w) | 0) * dy] };
}

// The highest-accumulation cell within radius (m) of (x, y): { cell, moved } or null outside the grid
export function snapSite(x, y, acc, g, radius) {
  const c = g.toIndex(x, y);
  if (c < 0) return null;
  const cx = c % g.w, cy = (c / g.w) | 0, rx = Math.ceil(radius / g.dx), ry = Math.ceil(radius / g.dy);
  let best = c;
  for (let j = Math.max(0, cy - ry); j <= Math.min(g.h - 1, cy + ry); j++) for (let i = Math.max(0, cx - rx); i <= Math.min(g.w - 1, cx + rx); i++) {
    const k = j * g.w + i;
    if (Math.hypot((i - cx) * g.dx, (j - cy) * g.dy) <= radius && acc[k] > acc[best]) best = k;
  }
  const [bx, by] = g.toXY(best);
  return { cell: best, moved: Math.hypot(bx - x, by - y) };
}

// Sub-catchment label of every cell: the index of the first site its flow reaches (-1 none). siteCells: cell per site
// (-1 = not placed). Two sites on one cell: the first keeps it, the other gets no sub-catchment (reported).
export function subcatchments(dir, order, w, siteCells) {
  const n = dir.length, label = new Int32Array(n).fill(-1);
  siteCells.forEach((c, s) => { if (c >= 0 && label[c] < 0) label[c] = s; });
  for (let k = order.length - 1; k >= 0; k--) { // downstream first
    const i = order[k];
    if (label[i] >= 0 && siteCells[label[i]] === i) continue;
    const d = downstreamOf(i, dir, w);
    if (d >= 0) label[i] = label[d];
  }
  return label;
}

// The site tree: for each site, the first site downstream (-1 none); per site the sub-catchment cell count and the
// whole-catchment cell count (its own plus every site upstream of it)
export function siteTree(dir, w, siteCells, label) {
  const ns = siteCells.length, down = new Int32Array(ns).fill(-1), own = new Float64Array(ns);
  for (let i = 0; i < label.length; i++) if (label[i] >= 0) own[label[i]]++;
  siteCells.forEach((c, s) => {
    if (c < 0 || siteCells[label[c]] !== c || label[c] !== s) return;
    const d = downstreamOf(c, dir, w);
    down[s] = d >= 0 ? label[d] : -1;
  });
  const total = Float64Array.from(own), kids = Array.from({ length: ns }, () => []);
  down.forEach((d, s) => { if (d >= 0) kids[d].push(s); });
  // whole catchments: add each site's total to the site downstream, upstream sites first (topological over the tree)
  const indeg = new Int32Array(ns);
  down.forEach((d) => { if (d >= 0) indeg[d]++; });
  const q = [];
  for (let s = 0; s < ns; s++) if (indeg[s] === 0) q.push(s);
  for (let k = 0; k < q.length; k++) { const s = q[k], d = down[s]; if (d >= 0) { total[d] += total[s]; if (--indeg[d] === 0) q.push(d); } }
  return { down, own, total, kids };
}

// Hawkes productivity per site: (value - background) x catchment area (km²); value / background in the element's unit
export function hawkes(value, background, areaKm2) {
  if (!(value > 0) || !(background > 0) || !(areaKm2 > 0)) return null;
  return (value - background) * areaKm2;
}

// The channel from a site cell upstream, following the largest contributing neighbour, until a cell belonging to
// another site's sub-catchment boundary (a site cell) or the stream head (acc < minCells). -> [cells]
export function reachUpstream(start, dir, acc, w, h, minCells, isSiteCell) {
  const path = [start];
  let c = start;
  for (let guard = 0; guard < w * h; guard++) {
    const cx = c % w, cy = (c / w) | 0;
    let best = -1, bestA = -1;
    for (let d = 0; d < 8; d++) {
      const x = cx + DX[d], y = cy + DY[d];
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const j = y * w + x;
      if (downstreamOf(j, dir, w) !== c) continue; // flows into c
      if (acc[j] > bestA) { bestA = acc[j]; best = j; }
    }
    if (best < 0 || acc[best] < minCells) break;
    path.push(best);
    if (isSiteCell(best)) break;
    c = best;
  }
  return path;
}

// Stream cells (acc >= minCells) traced into polylines, one per link (junction to junction), with Strahler order
export function streamPolylines(dir, acc, so, w, h, minCells, toXY) {
  const n = dir.length, inCount = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (acc[i] >= minCells) { const d = downstreamOf(i, dir, w); if (d >= 0 && acc[d] >= minCells) inCount[d]++; }
  const lines = [];
  for (let i = 0; i < n; i++) {
    if (acc[i] < minCells || inCount[i] === 1) continue; // a link starts at a head (0 in) or a junction (2+ in)
    const pts = [toXY(i)];
    let c = i;
    for (let guard = 0; guard < n; guard++) {
      const d = downstreamOf(c, dir, w);
      if (d < 0 || acc[d] < minCells) break;
      pts.push(toXY(d));
      if (inCount[d] !== 1) break; // the next junction ends the link
      c = d;
    }
    if (pts.length > 1) lines.push({ order: so[i], points: pts });
  }
  return lines;
}

// The routing of a whole terrain: fill, D8, accumulation. -> { dir, acc, order, filledCells, w, h, dx, dy }
// terrain.noDataMask is the base64 BITSET of demFill.js (#421: bit i = node i was filled from no data), or its bytes
export function noDataBits(mask) {
  if (!mask) return null;
  if (mask instanceof Uint8Array) return mask;
  const bin = atob(String(mask)), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
export function routeTerrain(terrain) {
  const g = gridGeometry(terrain), bits = noDataBits(terrain.noDataMask);
  const isNoData = bits ? (i) => (bits[i >> 3] & (1 << (i & 7))) !== 0 : () => false;
  const z = fillDepressions(terrain.elevations, g.w, g.h, isNoData);
  let filled = 0;
  for (let i = 0; i < z.length; i++) if (z[i] - terrain.elevations[i] > 0.01) filled++;
  const dir = flowDirections(z, g.w, g.h, g.dx, g.dy);
  const { order, acc } = accumulate(dir, g.w, g.h);
  return { dir, acc, order: Int32Array.from(order), filledCells: filled, w: g.w, h: g.h, dx: g.dx, dy: g.dy };
}
