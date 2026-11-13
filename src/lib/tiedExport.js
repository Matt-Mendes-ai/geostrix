// TASKS.csv #2322 (split from #2320) — exports that carry a coordinate system (a GeoTIFF, a GPS file, KML, a GeoPackage) from a LOCAL-GRID
// project tied to a real CRS (lib/localGridTie.js) are written in the tie's CRS, through the tie, instead of being refused as 'not available
// on a local grid' (#2180). The tie is a similarity (scale, rotation, shift): points and lines go straight through it, bearings turn by the
// grid's rotation, and grids and pictures are RESAMPLED onto the tie CRS's own north (nearest node / pixel, as rasterTie.js brings files in;
// corners outside the turned grid are no-data).
// ensureExportCrs itself is unchanged: an export not moved to exportCrs still refuses on a local grid rather than stamping grid numbers with
// a real CRS. Loaded only by the exporters that use it (not at startup).
import { ensureExportCrs } from "./projectCrsRequest.js";
import { tieOf, localToWorld, worldToLocal } from "./localGridTie.js";
import { t as tr } from "./i18n.js";

// -> { epsg, tie } (tie null on a project with a CRS of its own), or null when the user put the CRS question off
export async function exportCrs(project) {
  const tie = tieOf(project);
  if (tie) return { epsg: Number(tie.epsg), tie };
  const epsg = await ensureExportCrs(project);
  return epsg ? { epsg: Number(epsg), tie: null } : null;
}

// local (x, y) -> [X, Y] in the export CRS (unchanged without a tie)
export const exportXY = (tie) => (tie ? (x, y) => { const w = localToWorld(tie, x, y); return [w.x, w.y]; } : (x, y) => [x, y]);
// a bearing from the local grid's north -> from the tie CRS's grid north (localGridTie bearingToLocal, the other way)
export const bearingToWorld = (tie, deg) => (tie && Number.isFinite(deg) ? (((deg - tie.rotationDeg) % 360) + 360) % 360 : deg);

// a node grid { nx, ny, x0, yTop, dx, dy } (node (i, j) at x0 + i dx, yTop - j dy) -> the grid-aligned node grid in the tie CRS covering it,
// with each out node's nearest source node (-1 outside). Node spacing kept (in the tie CRS's units), at most maxNodes a side.
// -> { nx, ny, x0, yTop, dx, dy, src: Int32Array }
export function gridMapToWorld(g, tie, maxNodes = 4096) {
  const x1 = g.x0 + g.dx * (g.nx - 1), yB = g.yTop - g.dy * (g.ny - 1);
  let a = Infinity, b = Infinity, c = -Infinity, e = -Infinity;
  for (const [x, y] of [[g.x0, g.yTop], [x1, g.yTop], [x1, yB], [g.x0, yB]]) { const w = localToWorld(tie, x, y); a = Math.min(a, w.x); b = Math.min(b, w.y); c = Math.max(c, w.x); e = Math.max(e, w.y); }
  const d = Math.sqrt(g.dx * g.dy) * (tie.scale || 1);
  let nx = Math.max(1, Math.round((c - a) / d) + 1), ny = Math.max(1, Math.round((e - b) / d) + 1);
  const k = Math.max(nx, ny) / maxNodes;
  if (k > 1) { nx = Math.max(2, Math.round(nx / k)); ny = Math.max(2, Math.round(ny / k)); }
  const dx = nx > 1 ? (c - a) / (nx - 1) : d, dy = ny > 1 ? (e - b) / (ny - 1) : d;
  const src = new Int32Array(nx * ny).fill(-1), half = 0.5 + 1e-9;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const s = worldToLocal(tie, a + i * dx, e - j * dy);
    const fi = (s.x - g.x0) / g.dx, fj = (g.yTop - s.y) / g.dy;
    if (fi < -half || fj < -half || fi > g.nx - 1 + half || fj > g.ny - 1 + half) continue;
    src[j * nx + i] = Math.min(g.ny - 1, Math.max(0, Math.round(fj))) * g.nx + Math.min(g.nx - 1, Math.max(0, Math.round(fi)));
  }
  return { nx, ny, x0: a, yTop: e, dx, dy, src };
}
// one band of the source grid through the map -> Float32Array (NaN outside)
export function applyGridMap(m, values) {
  const out = new Float32Array(m.src.length);
  for (let k = 0; k < out.length; k++) { const s = m.src[k]; out[k] = s >= 0 ? values[s] : NaN; }
  return out;
}
// gridToGeoTIFF's input ({ nx, ny, x0, yTop, dx, dy, bands: [{ values }] }) through the tie (unchanged without one)
export function gridBandsToWorld(g, tie) {
  if (!tie) return g;
  const m = gridMapToWorld(g, tie);
  return { ...g, nx: m.nx, ny: m.ny, x0: m.x0, yTop: m.yTop, dx: m.dx, dy: m.dy, bands: g.bands.map((b) => ({ ...b, values: applyGridMap(m, b.values) })) };
}
// a terrain ({ bbox (node box), gridW, gridH, elevations, row 0 north }) through the tie (unchanged without one)
export function terrainToWorld(t, tie) {
  if (!tie) return t;
  const [x0, y0, x1, y1] = t.bbox, g = { nx: t.gridW, ny: t.gridH, x0, yTop: y1, dx: (x1 - x0) / Math.max(1, t.gridW - 1), dy: (y1 - y0) / Math.max(1, t.gridH - 1) };
  const m = gridMapToWorld(g, tie);
  return { ...t, bbox: [m.x0, m.yTop - m.dy * (m.ny - 1), m.x0 + m.dx * (m.nx - 1), m.yTop], gridW: m.nx, gridH: m.ny, elevations: Array.from(applyGridMap(m, t.elevations)) };
}
// an RGBA picture ({ width, height, data, bbox: pixel AREAS, row 0 north }) through the tie -> the same in the tie CRS (outside transparent)
export function imageToWorld(img, tie, maxSide = 4096) {
  if (!tie) return img;
  const [xmin, ymin, xmax, ymax] = img.bbox, { width, height, data } = img;
  let a = Infinity, b = Infinity, c = -Infinity, e = -Infinity;
  for (const [x, y] of [[xmin, ymax], [xmax, ymax], [xmax, ymin], [xmin, ymin]]) { const w = localToWorld(tie, x, y); a = Math.min(a, w.x); b = Math.min(b, w.y); c = Math.max(c, w.x); e = Math.max(e, w.y); }
  const pix = Math.sqrt(((xmax - xmin) * (ymax - ymin)) / Math.max(1, width * height)) * (tie.scale || 1);
  let ow = Math.max(1, Math.ceil((c - a) / pix)), oh = Math.max(1, Math.ceil((e - b) / pix));
  const k = Math.max(ow, oh) / maxSide;
  if (k > 1) { ow = Math.max(1, Math.round(ow / k)); oh = Math.max(1, Math.round(oh / k)); }
  const out = new Uint8ClampedArray(ow * oh * 4), pw = (c - a) / ow, ph = (e - b) / oh;
  for (let row = 0; row < oh; row++) for (let col = 0; col < ow; col++) {
    const s = worldToLocal(tie, a + (col + 0.5) * pw, e - (row + 0.5) * ph);
    if (s.x < xmin || s.x > xmax || s.y < ymin || s.y > ymax) continue; // alpha 0
    const px = Math.min(width - 1, Math.floor(((s.x - xmin) / (xmax - xmin)) * width)), py = Math.min(height - 1, Math.floor(((ymax - s.y) / (ymax - ymin)) * height));
    const si = (py * width + px) * 4, di = (row * ow + col) * 4;
    out[di] = data[si]; out[di + 1] = data[si + 1]; out[di + 2] = data[si + 2]; out[di + 3] = data[si + 3];
  }
  return { width: ow, height: oh, data: out, bbox: [a, b, c, e] };
}
// a surface-structure set ({ rows: [{ x, y, dipDir, ... }] }) in the tie CRS: positions through the tie, dip directions turned by the rotation
export function structureSetToWorld(set, tie) {
  if (!tie) return set;
  const P = exportXY(tie);
  return { ...set, rows: (set.rows || []).map((r) => {
    if (!Number.isFinite(r.x) || !Number.isFinite(r.y)) return r;
    const [x, y] = P(r.x, r.y), dd = typeof r.dipDir === "number" ? r.dipDir : r.dipDir == null || r.dipDir === "" ? NaN : Number(r.dipDir);
    return { ...r, x, y, ...(Number.isFinite(dd) ? { dipDir: Math.round(bearingToWorld(tie, dd) * 1e6) / 1e6 } : {}) };
  }) };
}
// f(x, y) of the LOCAL grid (a terrain lookup) asked at a point in the tie CRS (unchanged without a tie)
export const atLocal = (tie, f) => (tie && f ? (X, Y) => { const l = worldToLocal(tie, X, Y); return f(l.x, l.y); } : f);
// the sentence an export adds on a tied grid
export const tiedExportNote = (tie) => (tie ? " " + tr("Written in EPSG:{epsg} through the local grid's tie (rotation {rot}°): grids and pictures were resampled onto that CRS's north.", { epsg: tie.epsg, rot: +Number(tie.rotationDeg).toFixed(3) }) : "");
