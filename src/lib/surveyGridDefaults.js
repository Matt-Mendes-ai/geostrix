// TASKS.csv #3322 (review #3195, Galore Creek) — Grid to raster's proposals on a 3D IP cloud were unusable: the cell (0.5 m) and the
// blanking (2 m) came from the plan spacing of every level at once, so the first press of Generate was refused as an 8,644 x 7,411
// grid; a typed 50 m cell kept the 6 m blanking and left 382 of 5,082 cells; and stations on lines with no line column were
// blanked at twice their along-line spacing, so everything between the lines was empty.
// Here: a proposed depth slice for a 3D cloud (the level with the most points), a line spacing estimated when the file has no
// line column, a cell never over the 4,000,000-cell limit, and a blanking at least 1.5 cells wide.
import { suggestBlankingDistance, suggestIdwCell, snappedGridExtent } from "./idw.js";
import { median } from "./arrayStats.js";

export const MAX_GRID_CELLS = 4_000_000; // the Generate button's own limit

// the smallest 'round' value (1, 2, 2.5, 5 x 10^n) at or above v
export function niceAtLeast(v) {
  if (!(v > 0)) return null;
  const p = 10 ** Math.floor(Math.log10(v));
  return +([1, 2, 2.5, 5, 10].map((k) => k * p).find((c) => c >= v - 1e-9 * p) || 10 * p).toPrecision(6);
}
const nextNice = (c) => niceAtLeast(c * 1.0001 + 1e-12);

// the grid's size at this cell, on the snapped extent Generate uses
export function gridSizeAt(ext, cell) {
  const e = snappedGridExtent(ext, cell);
  return { nx: Math.round((e.xmax - e.xmin) / cell), ny: Math.round((e.ymax - e.ymin) / cell) };
}
// the smallest round cell whose grid stays within maxCells
export function minCellFor(ext, maxCells = MAX_GRID_CELLS) {
  const area = Math.max(0, ext.xmax - ext.xmin) * Math.max(0, ext.ymax - ext.ymin);
  let c = niceAtLeast(Math.max(1e-3, Math.sqrt(area / maxCells)));
  for (let k = 0; k < 40; k++) { const { nx, ny } = gridSizeAt(ext, c); if (nx * ny <= maxCells) return c; c = nextNice(c); }
  return c;
}

// Stations on lines with no line column: for a sample of stations, the line's direction u (the main axis of the 8 nearest stations,
// so two levels a few centimetres apart in plan do not set it), the nearest station (the along-line spacing) and the nearest one
// more than 60 degrees off u (the next line). -> { along, across } medians, or null.
const K = 8;
export function acrossLineSpacing(points, sample = 200) {
  const pts = (points || []).filter((p) => Number.isFinite(p?.x) && Number.isFinite(p?.y));
  const n = pts.length;
  if (n < K + 2) return null;
  const idx = n <= sample ? pts.map((_, i) => i) : Array.from({ length: sample }, (_, k) => Math.floor((k * n) / sample));
  const along = [], across = [];
  let lineLike = 0;
  const nq = new Float64Array(K), nx = new Float64Array(K), ny = new Float64Array(K);
  for (const i of idx) {
    const a = pts[i];
    let m = 0;
    for (let j = 0; j < n; j++) {
      const dx = pts[j].x - a.x, dy = pts[j].y - a.y, q = dx * dx + dy * dy;
      if (!(q > 0) || (m === K && q >= nq[K - 1])) continue;
      let k = m < K ? m++ : K - 1;
      while (k > 0 && nq[k - 1] > q) { nq[k] = nq[k - 1]; nx[k] = nx[k - 1]; ny[k] = ny[k - 1]; k--; }
      nq[k] = q; nx[k] = dx; ny[k] = dy;
    }
    if (m < 2) continue;
    let sxx = 0, syy = 0, sxy = 0; // the neighbours' main axis (through the station itself)
    for (let k = 0; k < m; k++) { sxx += nx[k] * nx[k]; syy += ny[k] * ny[k]; sxy += nx[k] * ny[k]; }
    const th = 0.5 * Math.atan2(2 * sxy, sxx - syy), ux = Math.cos(th), uy = Math.sin(th);
    const ul = Math.sqrt(nq[0]);
    // on a line: the 8 nearest along one axis (the cross-axis spread under a tenth of the main one) and evenly out to the 8th (at most
    // twice the 5th's distance, which levels a few centimetres apart in plan do not upset); a pair of stations or a cluster is not a line
    const tr = sxx + syy, det = sxx * syy - sxy * sxy, l1 = tr / 2 + Math.sqrt(Math.max(0, (tr * tr) / 4 - det)), l2 = tr - l1;
    if (m === K && nq[K - 1] <= 4 * nq[4] && l2 < 0.1 * l1) lineLike++;
    let off = Infinity;
    for (let j = 0; j < n; j++) {
      const dx = pts[j].x - a.x, dy = pts[j].y - a.y, q = dx * dx + dy * dy;
      if (!(q > 0) || q >= off) continue;
      if (Math.abs(dx * ux + dy * uy) / Math.sqrt(q) < 0.5) off = q; // |cos| < 0.5: more than 60 degrees off the line
    }
    along.push(ul);
    if (Number.isFinite(off)) across.push(Math.sqrt(off));
  }
  if (!along.length || across.length < along.length / 2 || lineLike < 0.6 * along.length) return null;
  return { along: median(along), across: median(across) };
}

// The proposals for one set of points (a surface survey, or one slice of a 3D cloud).
// -> { spacing, distance, basis, linesEstimated, alongSpacing, cell, spacingCell, capped } or null.
// basis: "line spacing" (line column), "station spacing", or "estimated line spacing" (no line column, stations at least 3 times
// closer along the lines than across them).
export function surveyGridDefaults(points, { maxCells = MAX_GRID_CELLS } = {}) {
  const s = suggestBlankingDistance(points);
  if (!s) return null;
  let { spacing, distance, basis } = s, linesEstimated = false;
  if (basis === "station spacing") {
    const a = acrossLineSpacing(points);
    if (a && a.across >= 3 * a.along) { spacing = a.across; distance = 1.5 * a.across; basis = "estimated line spacing"; linesEstimated = true; }
  }
  let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
  for (const p of points) { if (!Number.isFinite(p?.x) || !Number.isFinite(p?.y)) continue; if (p.x < xmin) xmin = p.x; if (p.x > xmax) xmax = p.x; if (p.y < ymin) ymin = p.y; if (p.y > ymax) ymax = p.y; }
  const spacingCell = suggestIdwCell(spacing) || 25;
  const floor = minCellFor({ xmin, ymin, xmax, ymax }, maxCells);
  const cell = Math.max(spacingCell, floor);
  return { spacing, distance, basis, linesEstimated, alongSpacing: s.spacing, cell, spacingCell, capped: cell > spacingCell };
}

// the blanking that goes with a cell: the spacing's own, but never under 1.5 cells (a 50 m cell blanked at 6 m left 382 of 5,082 cells)
export const blankForCell = (distance, cell) => Math.max(Number(distance) || 0, 1.5 * (Number(cell) || 0));

// A depth slice to propose for a 3D cloud. Levels (a few z values each shared by many points, as on an inversion mesh): the level with the most
// points (a tie: the one nearest the median elevation), from halfway to the level below to halfway to the level above. No levels: a
// round thickness of about a twentieth of the elevation range, on the band with the most points.
// -> { layered, z?, gap?, thickness?, lo, hi, n } or null.
export function proposeSlice(points) {
  const zs = (points || []).map((p) => p?.z).filter(Number.isFinite);
  if (zs.length < 20) return null;
  const r2 = (v) => Math.round(v * 100) / 100;
  const counts = new Map();
  for (const z of zs) { const k = r2(z); counts.set(k, (counts.get(k) || 0) + 1); }
  const zMed = median(zs);
  // levels: few distinct elevations, each shared by many points (at most the square root of the count: a mesh of nz levels has nx * ny
  // points on each); a wavy section (elevations to the centimetre, repeated a few times) is a band, not 0.02 m levels
  if (counts.size >= 2 && counts.size <= Math.sqrt(zs.length)) {
    const lv = [...counts.keys()].sort((a, b) => a - b);
    let bi = 0;
    for (let i = 1; i < lv.length; i++) { const c = counts.get(lv[i]), cb = counts.get(lv[bi]); if (c > cb || (c === cb && Math.abs(lv[i] - zMed) < Math.abs(lv[bi] - zMed))) bi = i; }
    const gaps = lv.slice(1).map((v, i) => v - lv[i]);
    const gap = median(gaps);
    const below = bi > 0 ? lv[bi] - lv[bi - 1] : gaps[0], above = bi < lv.length - 1 ? lv[bi + 1] - lv[bi] : gaps[gaps.length - 1];
    return { layered: true, z: lv[bi], gap, lo: r2(lv[bi] - below / 2), hi: r2(lv[bi] + above / 2), n: counts.get(lv[bi]) };
  }
  let zMin = Infinity, zMax = -Infinity;
  for (const z of zs) { if (z < zMin) zMin = z; if (z > zMax) zMax = z; }
  const t = niceAtLeast((zMax - zMin) / 20) || 1;
  const bins = new Map();
  for (const z of zs) { const b = Math.floor(z / t + 1e-9); bins.set(b, (bins.get(b) || 0) + 1); }
  const bMed = Math.floor(zMed / t + 1e-9);
  let bb = null;
  for (const [b, c] of bins) { const cb = bb == null ? -1 : bins.get(bb); if (c > cb || (c === cb && Math.abs(b - bMed) < Math.abs(bb - bMed))) bb = b; }
  return { layered: false, thickness: t, lo: r2(bb * t), hi: r2((bb + 1) * t), n: bins.get(bb) };
}
