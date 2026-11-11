// TASKS.csv #2648 (follow-up of #2587, review #2486: a mine grid tied to MGA) — a terrain brought INTO a tied local grid
// (lib/localGridTie.js). A DEM file with a CRS tag, or terrain fetched online, is first put in the tie's CRS, then its node
// grid is resampled onto a grid-aligned (local north-up) node grid, nearest node (lib/rasterTie.js tieGridToLocal): the
// heights are the source's own, nothing is averaged in. Cells outside the source stay no-data (demFill.js #421).
// Before, a tied project was asked to choose a project CRS before fetching terrain, and a DEM file kept its MGA numbers.
// Pure: no DOM.
import { tieGridToLocal, tieReaches, localBoxOf } from "./rasterTie.js";
import { localToWorld } from "./localGridTie.js";
import { reprojectXY } from "./reproject.js";
import { fillNoData, decodeNoDataMask, isNoData, noDataNote } from "./demFill.js";

// a terrain node grid { bbox, gridW, gridH, values (NaN = no data) } in srcEpsg -> the same in the local grid (NaN gaps kept),
// or null when the tie cannot reach srcEpsg or nothing lands in the grid. clip: the local box to cover instead of the whole source
// (a crop window read north-up in the file's CRS and turned back into a rotated grid covers about twice the box asked for)
export function tieDemGridToLocal({ bbox, gridW, gridH, values }, tie, srcEpsg, gridMax = 512, clip = null) {
  const [xmin, ymin, xmax, ymax] = bbox;
  const src = { nx: gridW, ny: gridH, x0: xmin, yTop: ymax, dx: (xmax - xmin) / Math.max(1, gridW - 1), dy: (ymax - ymin) / Math.max(1, gridH - 1), values };
  const g = clip ? clipToLocal(src, tie, srcEpsg, gridMax, clip) : tieGridToLocal(src, tie, srcEpsg, gridMax);
  if (!g || !g.valid) return null;
  return { bbox: [g.x0, g.yTop - g.dy * (g.ny - 1), g.x0 + g.dx * (g.nx - 1), g.yTop], gridW: g.nx, gridH: g.ny, values: g.values };
}
// nearest source node at each node of a grid over the clip box (within the source's own local box), at the source spacing or
// coarser to keep gridMax nodes on the long side
function clipToLocal(src, tie, srcEpsg, gridMax, clip) {
  if (!tieReaches(tie, srcEpsg)) return null;
  const lb = localBoxOf(tie, srcEpsg, [src.x0, src.yTop - src.dy * (src.ny - 1), src.x0 + src.dx * (src.nx - 1), src.yTop]);
  if (!lb) return null;
  const x0 = Math.max(clip[0], lb[0]), y0 = Math.max(clip[1], lb[1]), x1 = Math.min(clip[2], lb[2]), y1 = Math.min(clip[3], lb[3]);
  if (!(x1 > x0 && y1 > y0)) return null;
  const step = Math.max(Math.sqrt(src.dx * src.dy) / (tie.scale || 1), Math.max(x1 - x0, y1 - y0) / Math.max(1, gridMax - 1));
  const nx = Math.max(2, Math.round((x1 - x0) / step) + 1), ny = Math.max(2, Math.round((y1 - y0) / step) + 1);
  const dx = (x1 - x0) / (nx - 1), dy = (y1 - y0) / (ny - 1), same = Number(srcEpsg) === Number(tie.epsg);
  const values = new Float32Array(nx * ny).fill(NaN);
  let valid = 0;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    let w = localToWorld(tie, x0 + i * dx, y1 - j * dy);
    if (!same) { w = reprojectXY(w.x, w.y, Number(tie.epsg), Number(srcEpsg)); if (!w || !Number.isFinite(w.x) || !Number.isFinite(w.y)) continue; }
    const fi = (w.x - src.x0) / src.dx, fj = (src.yTop - w.y) / src.dy;
    if (fi < -0.5 || fj < -0.5 || fi > src.nx - 0.5 || fj > src.ny - 0.5) continue;
    const v = src.values[Math.min(src.ny - 1, Math.max(0, Math.round(fj))) * src.nx + Math.min(src.nx - 1, Math.max(0, Math.round(fi)))];
    if (Number.isFinite(v)) { values[j * nx + i] = v; valid++; }
  }
  return { nx, ny, x0, yTop: y1, dx, dy, values, valid };
}

// a filled terrain (elevations + noDataMask, as addTerrain takes it) -> the same in the local grid, refilled; null as above
export function tieTerrainToLocal(t, tie, srcEpsg, gridMax = 512) {
  const mask = decodeNoDataMask(t.noDataMask);
  const values = Float32Array.from(t.elevations, (v, i) => (isNoData(mask, i) ? NaN : v));
  const g = tieDemGridToLocal({ bbox: t.bbox, gridW: t.gridW, gridH: t.gridH, values }, tie, srcEpsg, gridMax);
  if (!g) return null;
  const fill = fillNoData(g.values);
  return { ...t, bbox: g.bbox, gridW: g.gridW, gridH: g.gridH, elevations: fill.elevations, noDataMask: fill.noDataMask, noDataNote: noDataNote(fill), reprojectedTo: null, reprojectNote: null };
}

// a box in the local grid -> the box in the tie's CRS that covers it (its four corners: the tie is a similarity, so the edges stay straight)
export function tieWorldBox(tie, [x0, y0, x1, y1]) {
  const c = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => localToWorld(tie, x, y));
  return [Math.min(...c.map((p) => p.x)), Math.min(...c.map((p) => p.y)), Math.max(...c.map((p) => p.x)), Math.max(...c.map((p) => p.y))];
}
