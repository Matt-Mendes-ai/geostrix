// TASKS.csv #2587 / #2322 (review #2486, WA lithium on a mine grid tied to MGA) — a raster with its own CRS brought INTO a tied local
// grid (lib/localGridTie.js). The tie is a similarity: a rotated grid turns the file's north-up pixels, so the picture and the value
// grid are RESAMPLED onto a grid-aligned (local north-up) raster, nearest neighbour as reprojectImageRGBA does (a classified picture
// keeps its colours; a value grid keeps its readings, no invented in-between values). Pixels outside the file are transparent / NaN.
// Before, a GeoTIFF tagged EPSG:28350 on a project tied to EPSG:28350 kept its MGA numbers and landed 6,240 km from the collars.
// Pure: no DOM (the caller draws the RGBA into a canvas).
import { localToWorld } from "./localGridTie.js";
import { reprojectXY, getProj4DefSync } from "./reproject.js";

// can this file's CRS reach the tie's? (the same CRS, or both codes proj4 can build)
export const tieReaches = (tie, srcEpsg) => !!tie && !!Number(srcEpsg) && (Number(srcEpsg) === Number(tie.epsg) || (!!getProj4DefSync(Number(srcEpsg)) && !!getProj4DefSync(Number(tie.epsg))));

// local grid (x, y) -> the file's CRS, or null
function localToFile(tie, srcEpsg) {
  const same = Number(srcEpsg) === Number(tie.epsg);
  return (x, y) => {
    const w = localToWorld(tie, x, y);
    if (same) return w;
    const r = reprojectXY(w.x, w.y, Number(tie.epsg), Number(srcEpsg));
    return r && Number.isFinite(r.x) && Number.isFinite(r.y) ? r : null;
  };
}
// the file's CRS -> local grid
function fileToLocalFn(tie, srcEpsg) {
  const same = Number(srcEpsg) === Number(tie.epsg);
  const d = tie.a * tie.a + tie.b * tie.b;
  return (X, Y) => {
    const w = same ? { x: X, y: Y } : reprojectXY(X, Y, Number(srcEpsg), Number(tie.epsg));
    if (!w || !Number.isFinite(w.x) || !Number.isFinite(w.y)) return null;
    const dx = w.x - tie.tx, dy = w.y - tie.ty;
    return { x: (tie.a * dx + tie.b * dy) / d, y: (-tie.b * dx + tie.a * dy) / d };
  };
}
// the local-grid box covering a file-CRS box (its edges walked, so a reprojection's curved edge is covered too)
export function localBoxOf(tie, srcEpsg, [xmin, ymin, xmax, ymax], steps = 16) {
  const f = fileToLocalFn(tie, srcEpsg);
  let a = Infinity, b = Infinity, c = -Infinity, e = -Infinity;
  for (let k = 0; k <= steps; k++) {
    const t = k / steps, x = xmin + t * (xmax - xmin), y = ymin + t * (ymax - ymin);
    for (const [px, py] of [[x, ymin], [x, ymax], [xmin, y], [xmax, y]]) {
      const p = f(px, py);
      if (!p) continue;
      if (p.x < a) a = p.x; if (p.x > c) c = p.x; if (p.y < b) b = p.y; if (p.y > e) e = p.y;
    }
  }
  return Number.isFinite(a) ? [a, b, c, e] : null;
}

// out size: the source's pixel size carried over (in local units), capped at maxSide on the long side
function outSize(lb, srcBox, w, h, scale, maxSide) {
  const pix = Math.sqrt(((srcBox[2] - srcBox[0]) * (srcBox[3] - srcBox[1])) / Math.max(1, w * h)) / (scale || 1);
  let ow = Math.max(1, Math.ceil((lb[2] - lb[0]) / pix)), oh = Math.max(1, Math.ceil((lb[3] - lb[1]) / pix));
  const k = Math.max(ow, oh) / maxSide;
  if (k > 1) { ow = Math.max(1, Math.round(ow / k)); oh = Math.max(1, Math.round(oh / k)); }
  return [ow, oh];
}

// An RGBA picture (bbox in the file's CRS, row 0 = north, pixel AREAS covering the bbox) -> the same in the local grid.
// -> { bbox, width, height, data } | null when the file's CRS cannot reach the tie
export function tieImageToLocal({ xmin, ymin, xmax, ymax, width, height, data }, tie, srcEpsg, maxSide = 4096) {
  if (!tieReaches(tie, srcEpsg)) return null;
  const lb = localBoxOf(tie, srcEpsg, [xmin, ymin, xmax, ymax]);
  if (!lb) return null;
  const [ow, oh] = outSize(lb, [xmin, ymin, xmax, ymax], width, height, tie.scale, maxSide);
  const inv = localToFile(tie, srcEpsg);
  const out = new Uint8ClampedArray(ow * oh * 4);
  const pw = (lb[2] - lb[0]) / ow, ph = (lb[3] - lb[1]) / oh;
  for (let row = 0; row < oh; row++) {
    const y = lb[3] - (row + 0.5) * ph;
    for (let col = 0; col < ow; col++) {
      const s = inv(lb[0] + (col + 0.5) * pw, y);
      if (!s || s.x < xmin || s.x > xmax || s.y < ymin || s.y > ymax) continue; // alpha 0
      const px = Math.min(width - 1, Math.floor(((s.x - xmin) / (xmax - xmin)) * width));
      const py = Math.min(height - 1, Math.floor(((ymax - s.y) / (ymax - ymin)) * height));
      const si = (py * width + px) * 4, di = (row * ow + col) * 4;
      out[di] = data[si]; out[di + 1] = data[si + 1]; out[di + 2] = data[si + 2]; out[di + 3] = data[si + 3];
    }
  }
  return { bbox: lb, width: ow, height: oh, data: out };
}

// A node grid (raster.js: value (i, j) at x0 + i*dx, yTop - j*dy, NaN = no data) -> a grid-aligned node grid in the local grid,
// nearest node. -> { nx, ny, x0, yTop, dx, dy, values: Float32Array, valid } | null
export function tieGridToLocal(g, tie, srcEpsg, maxNodes = 512) {
  if (!tieReaches(tie, srcEpsg) || !g?.nx || !g?.ny) return null;
  const x1 = g.x0 + g.dx * (g.nx - 1), yB = g.yTop - g.dy * (g.ny - 1);
  const lb = localBoxOf(tie, srcEpsg, [g.x0, yB, x1, g.yTop]);
  if (!lb) return null;
  const d = Math.sqrt(g.dx * g.dy) / (tie.scale || 1);
  let nx = Math.max(1, Math.round((lb[2] - lb[0]) / d) + 1), ny = Math.max(1, Math.round((lb[3] - lb[1]) / d) + 1);
  const k = Math.max(nx, ny) / maxNodes;
  if (k > 1) { nx = Math.max(2, Math.round(nx / k)); ny = Math.max(2, Math.round(ny / k)); }
  const dx = nx > 1 ? (lb[2] - lb[0]) / (nx - 1) : d, dy = ny > 1 ? (lb[3] - lb[1]) / (ny - 1) : d;
  const inv = localToFile(tie, srcEpsg);
  const values = new Float32Array(nx * ny).fill(NaN);
  let valid = 0;
  const half = 0.5 + 1e-9;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const s = inv(lb[0] + i * dx, lb[3] - j * dy);
    if (!s) continue;
    const fi = (s.x - g.x0) / g.dx, fj = (g.yTop - s.y) / g.dy;
    if (fi < -half || fj < -half || fi > g.nx - 1 + half || fj > g.ny - 1 + half) continue;
    const ii = Math.min(g.nx - 1, Math.max(0, Math.round(fi))), jj = Math.min(g.ny - 1, Math.max(0, Math.round(fj)));
    const v = g.values[jj * g.nx + ii];
    if (Number.isFinite(v)) { values[j * nx + i] = v; valid++; }
  }
  return { nx, ny, x0: lb[0], yTop: lb[3], dx, dy, values, valid };
}
