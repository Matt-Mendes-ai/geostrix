// TASKS.csv #894 — terrain from survey points or contour lines, for a project with no DEM (a property surveyed by GPS
// or total station, contours digitised from an old map or exported from CAD). A Delaunay triangulation (TIN) of the
// points, sampled linearly onto the regular node grid every other terrain source produces (bbox, gridW x gridH, row 0 =
// north), so the 3D view, sections, collar draping and derivatives take it unchanged.
//   - contour strings are densified first (a vertex at least every half cell), so long straight runs still shape the TIN;
//   - triangles with an edge longer than maxEdge (default 10 x the median edge) are left out: across a concave outline
//     or between two separate survey areas they would invent ground nobody measured;
//   - nodes outside the kept triangles are no-data (masked out of the 3D surface, filled for sampling: demFill.js);
//   - a triangle whose three corners share one elevation is flat - from a TIN of contours that is a terrace between two
//     vertices of the same contour (hilltops, valley floors); their share is reported, not hidden.
// Pure: no React, no three.js. Points are { x, y, z } in the project CRS.
import { Delaunay } from "d3-delaunay";
import { fillNoData } from "./demFill.js";

// polylines [[{x, y, z}]] -> points with a vertex at least every `step` along each segment (z interpolated)
export function densify(polylines, step) {
  const out = [];
  for (const pl of polylines || []) {
    for (let i = 0; i < pl.length; i++) {
      const a = pl[i];
      out.push({ x: a.x, y: a.y, z: a.z });
      const b = pl[i + 1];
      if (!b) break;
      const n = Math.floor(Math.hypot(b.x - a.x, b.y - a.y) / step);
      for (let k = 1; k <= n; k++) { const t = k / (n + 1); out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t }); }
    }
  }
  return out;
}

// { points: [{x, y, z}], lines: [[{x, y, z}]] } -> the terrain fields (bbox, gridW, gridH, elevations, noDataMask)
// + stats. Throws when fewer than 3 usable points remain or they lie on a line.
export function terrainFromPoints({ points = [], lines = [] } = {}, { gridMax = 200, maxEdgeFactor = 10 } = {}) {
  const ok = (p) => p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
  const raw = [...points.filter(ok), ...lines.flatMap((l) => l.filter(ok))];
  if (raw.length < 3) throw new Error("At least 3 points with elevations are needed to build a terrain.");
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of raw) { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; }
  if (!(x1 > x0) || !(y1 > y0)) throw new Error("The points lie on a line: a terrain needs them spread over an area.");
  const w = x1 - x0, h = y1 - y0;
  const gridW = w >= h ? gridMax : Math.max(2, Math.round((gridMax * w) / h));
  const gridH = w >= h ? Math.max(2, Math.round((gridMax * h) / w)) : gridMax;
  const dx = w / (gridW - 1), dy = h / (gridH - 1);
  // points: duplicates in plan dropped (the first elevation kept), contours densified to half a cell
  const seen = new Set(), P = [];
  const take = (p) => { const k = `${Math.round(p.x * 100)},${Math.round(p.y * 100)}`; if (!seen.has(k)) { seen.add(k); P.push(p); } };
  points.filter(ok).forEach(take);
  densify(lines.map((l) => l.filter(ok)), Math.min(dx, dy) / 2).forEach(take);
  const del = Delaunay.from(P, (p) => p.x, (p) => p.y);
  const T = del.triangles;
  if (!T.length) throw new Error("The points lie on a line: a terrain needs them spread over an area.");
  // the long-edge cut-off from the median edge length
  const edges = new Float64Array(T.length);
  for (let t = 0; t < T.length; t += 3) for (let k = 0; k < 3; k++) { const a = P[T[t + k]], b = P[T[t + (k + 1) % 3]]; edges[t + k] = Math.hypot(b.x - a.x, b.y - a.y); }
  const sorted = Float64Array.from(edges).sort();
  const maxEdge = maxEdgeFactor * sorted[sorted.length >> 1];
  const E = new Float64Array(gridW * gridH).fill(NaN);
  let kept = 0, dropped = 0, flat = 0;
  for (let t = 0; t < T.length; t += 3) {
    if (Math.max(edges[t], edges[t + 1], edges[t + 2]) > maxEdge) { dropped++; continue; }
    kept++;
    const A = P[T[t]], B = P[T[t + 1]], C = P[T[t + 2]];
    if (A.z === B.z && B.z === C.z) flat++;
    const det = (B.y - C.y) * (A.x - C.x) + (C.x - B.x) * (A.y - C.y);
    if (Math.abs(det) < 1e-12) continue;
    // node columns i (x0 + i dx) and rows j counted from the north (y1 - j dy) inside the triangle's box
    const i0 = Math.max(0, Math.ceil((Math.min(A.x, B.x, C.x) - x0) / dx - 1e-9)), i1 = Math.min(gridW - 1, Math.floor((Math.max(A.x, B.x, C.x) - x0) / dx + 1e-9));
    const j0 = Math.max(0, Math.ceil((y1 - Math.max(A.y, B.y, C.y)) / dy - 1e-9)), j1 = Math.min(gridH - 1, Math.floor((y1 - Math.min(A.y, B.y, C.y)) / dy + 1e-9));
    for (let j = j0; j <= j1; j++) {
      const py = y1 - j * dy;
      for (let i = i0; i <= i1; i++) {
        const k = j * gridW + i;
        if (E[k] === E[k]) continue; // already set by a neighbour sharing the edge
        const px = x0 + i * dx;
        const l1 = ((B.y - C.y) * (px - C.x) + (C.x - B.x) * (py - C.y)) / det, l2 = ((C.y - A.y) * (px - C.x) + (A.x - C.x) * (py - C.y)) / det, l3 = 1 - l1 - l2;
        if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue;
        E[k] = l1 * A.z + l2 * B.z + l3 * C.z;
      }
    }
  }
  const fill = fillNoData(Array.from(E));
  return {
    // no noDataNote: demFill's sentence is about reprojection corners and failed tiles; the caller says "outside the points"
    bbox: [x0, y0, x1, y1], gridW, gridH, elevations: fill.elevations, noDataMask: fill.noDataMask,
    stats: { points: P.length, given: raw.length, triangles: kept, longDropped: dropped, maxEdgeM: maxEdge, flatPct: kept ? (100 * flat) / kept : 0, cellM: Math.max(dx, dy), filledPct: fill.filledPct || 0, filledCount: fill.filledCount || 0, fillValue: fill.fillValue },
  };
}

// a table of points -> { x, y, z } columns guessed from the headers (x / easting / e, y / northing / n, z / elevation /
// rl / height); null for a column it cannot find
export function guessXYZ(headers) {
  const norm = (h) => String(h).trim().toLowerCase().replace(/[\s_()-]+/g, "");
  const find = (names) => headers.find((h) => names.includes(norm(h))) ?? null;
  return {
    x: find(["x", "east", "easting", "e", "utme", "eastingm", "xm", "lon", "longitude"]),
    y: find(["y", "north", "northing", "n", "utmn", "northingm", "ym", "lat", "latitude"]),
    z: find(["z", "elev", "elevation", "elevationm", "rl", "height", "alt", "altitude", "zm", "h"]),
  };
}
