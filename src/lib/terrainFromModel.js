// TASKS.csv #1806 (review #1646, Kodiak) — a terrain from the top of a block model, offline. A UBC / DCIP3D / SimPEG mesh carries
// the topography as its air / ground boundary (the air cells are no-data at import, #481), so the uppermost cell of every
// column is the ground there. On a project with no DEM (2,705 soils with no elevation and no download allowed), that is a
// terrain the samples can sit on, the sections can profile, and the viewer can clip to. Pure: no React, no three.js.
import { bytesToB64 } from "./base64.js";
import { median } from "./arrayStats.js";

// cells: [{ x, y, z, dx, dy, dz, value }] (centres); -> { bbox, gridW, gridH, elevations (Float32Array, row 0 = north),
// noDataMask (base64 bitset of the nodes with no column, or null), stats: { columns, nodeM: [dx, dy], relief: [zmin, zmax],
// empty } } | null (fewer than 2 x 2 columns)
export function terrainFromBlockModel(cells) {
  const MM = (v) => Math.round(v * 1000);
  const cols = new Map(); // "x,y" -> { x, y, top, dx, dy }
  for (const c of cells || []) {
    if (!Number.isFinite(c?.value) || !(c.dz > 0)) continue;
    const k = `${MM(c.x)},${MM(c.y)}`, top = c.z + c.dz / 2, w = cols.get(k);
    if (!w) cols.set(k, { x: c.x, y: c.y, top, dx: c.dx, dy: c.dy });
    else if (top > w.top) w.top = top;
  }
  if (cols.size < 4) return null;
  const C = [...cols.values()];
  const xs = [...new Set(C.map((c) => MM(c.x)))].sort((a, b) => a - b).map((v) => v / 1000), ys = [...new Set(C.map((c) => MM(c.y)))].sort((a, b) => a - b).map((v) => v / 1000);
  if (xs.length < 2 || ys.length < 2) return null;
  // a uniform node lattice at the typical column spacing (a tensor mesh's padding columns are wider: resampled by nearest column)
  const dx = median(xs.slice(1).map((v, i) => v - xs[i])), dy = median(ys.slice(1).map((v, i) => v - ys[i]));
  const bbox = [xs[0], ys[0], xs[xs.length - 1], ys[ys.length - 1]];
  const gridW = Math.max(2, Math.round((bbox[2] - bbox[0]) / dx) + 1), gridH = Math.max(2, Math.round((bbox[3] - bbox[1]) / dy) + 1);
  const byXY = new Map(C.map((c) => [`${MM(c.x)},${MM(c.y)}`, c]));
  const nearest = (sorted, v) => { let lo = 0, hi = sorted.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (sorted[m] <= v) lo = m; else hi = m; } return v - sorted[lo] <= sorted[hi] - v ? sorted[lo] : sorted[hi]; };
  const elevations = new Float32Array(gridW * gridH), bits = new Uint8Array(Math.ceil((gridW * gridH) / 8));
  let empty = 0, zmin = Infinity, zmax = -Infinity, fill = NaN;
  for (let j = 0; j < gridH; j++) {
    const y = bbox[3] - (j * (bbox[3] - bbox[1])) / (gridH - 1), cy = nearest(ys, y);
    for (let i = 0; i < gridW; i++) {
      const x = bbox[0] + (i * (bbox[2] - bbox[0])) / (gridW - 1), cx = nearest(xs, x);
      const col = byXY.get(`${MM(cx)},${MM(cy)}`), n = j * gridW + i;
      // a column that is not this node's nearest column within a cell: the node has no ground (a hole in the mesh's plan)
      if (!col || Math.abs(col.x - x) > col.dx * 0.75 + 1e-6 || Math.abs(col.y - y) > col.dy * 0.75 + 1e-6) { bits[n >> 3] |= 1 << (n & 7); empty++; elevations[n] = NaN; continue; }
      elevations[n] = col.top; zmin = Math.min(zmin, col.top); zmax = Math.max(zmax, col.top);
    }
  }
  if (!Number.isFinite(zmin)) return null;
  fill = zmin; // the filled nodes carry the lowest ground, as demFill's fallback does, and the mask says they are not measured
  for (let n = 0; n < elevations.length; n++) if (Number.isNaN(elevations[n])) elevations[n] = fill;
  return { bbox, gridW, gridH, elevations, noDataMask: empty ? bytesToB64(bits) : null, stats: { columns: C.length, nodeM: [dx, dy], relief: [zmin, zmax], empty } };
}
