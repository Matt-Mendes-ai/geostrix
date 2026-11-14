// TASKS.csv #3310 (review #3195, Galore Creek) — Spatial analysis on an IP cloud (245,066 points) froze the window 16.6 s before it drew
// (heap 1.5 GB) and 43 s on the resistivity cloud (2.4 GB): the tessellation was built twice on the main thread (once for the drawing,
// once inside declusteredStats), every cell kept its polygon as arrays of pairs, and the drawing was one SVG polygon and one circle per
// point. This is the same polygonal declustering (geoprocessing.js declusteredStats, Isaaks & Srivastava) in one pass over flat arrays:
// each cell's area is read straight from d3's renderCell into a running shoelace sum (no polygon is kept), and the map is drawn by
// colour class onto a canvas. Run in lib/voronoi.worker.js, off the main thread; pure, so the tests run it in Node.
import { Delaunay } from "d3-delaunay";

// above this many points (or for a cloud cloudShape calls 3D) the dialog shows the count and a Run button instead of computing on open
export const ASK_FROM = 20000;
// at most this many points are drawn as dots, and their cells outlined (more is a solid wash of white on a 560 px map)
export const DRAW_POINTS_UPTO = 5000;

// a canvas-like context that adds up the shoelace sum of what d3 draws: one cell's area per take()
function areaContext() {
  let x0 = 0, y0 = 0, px = 0, py = 0, sum = 0;
  return {
    moveTo(x, y) { x0 = px = x; y0 = py = y; },
    lineTo(x, y) { sum += px * y - x * py; px = x; py = y; },
    closePath() { sum += px * y0 - x0 * py; px = x0; py = y0; },
    take() { const a = Math.abs(sum) / 2; sum = 0; return a; },
  };
}

// xs / ys / vs: Float64Arrays (vs NaN for no value); bounds: { xmin, ymin, xmax, ymax } (geoprocessing paddedBounds).
// onProgress(done, total, phase): phase "triangulate" | "cells". -> { areas, n, totalArea, naiveMean, declusteredMean, declusteredStd,
// delaunay, voronoi }: n counts the points with a value and a cell (a point at another's plan position has none), as declusteredStats does
export function voronoiDecluster(xs, ys, vs, bounds, { onProgress = null, now = () => Date.now(), every = 100 } = {}) {
  const n = xs.length;
  onProgress?.(0, n, "triangulate");
  const flat = new Float64Array(2 * n);
  for (let i = 0; i < n; i++) { flat[2 * i] = xs[i]; flat[2 * i + 1] = ys[i]; }
  const delaunay = new Delaunay(flat);
  const voronoi = delaunay.voronoi([bounds.xmin, bounds.ymin, bounds.xmax, bounds.ymax]);
  const areas = new Float64Array(n), ctx = areaContext();
  let last = now();
  for (let i = 0; i < n; i++) {
    voronoi.renderCell(i, ctx);
    areas[i] = ctx.take();
    if (onProgress && (i & 4095) === 0 && now() - last > every) { last = now(); onProgress(i, n, "cells"); }
  }
  let count = 0, totalArea = 0, sumV = 0;
  for (let i = 0; i < n; i++) if (Number.isFinite(vs[i]) && areas[i] > 0) { count++; totalArea += areas[i]; sumV += vs[i]; }
  const naiveMean = count ? sumV / count : null;
  let declusteredMean = null, declusteredStd = null;
  if (totalArea > 0) {
    let m = 0;
    for (let i = 0; i < n; i++) if (Number.isFinite(vs[i]) && areas[i] > 0) m += vs[i] * (areas[i] / totalArea);
    declusteredMean = m;
    if (count > 1) {
      let sumW2 = 0, num = 0;
      for (let i = 0; i < n; i++) if (Number.isFinite(vs[i]) && areas[i] > 0) { const w = areas[i] / totalArea; sumW2 += w * w; num += w * (vs[i] - m) ** 2; }
      const denom = 1 - sumW2;
      if (denom > 1e-9) declusteredStd = Math.sqrt(num / denom);
    }
  }
  onProgress?.(n, n, "cells");
  return { areas, n: count, totalArea, naiveMean, declusteredMean, declusteredStd, delaunay, voronoi };
}

// the colour stretch: the 2-98 % range of the values (geophysSurveys robustRange's rule, #1588; kept here so the worker does not load the
// layer library), the full range when that is empty. -> { min, max }
export function robustStretch(vs, lo = 0.02, hi = 0.98) {
  const v = Float64Array.from(vs).filter(Number.isFinite).sort();
  if (!v.length) return { min: 0, max: 1 };
  if (v.length < 20) return { min: v[0], max: v[v.length - 1] };
  const q = (p) => v[Math.round(p * (v.length - 1))];
  const r = { min: q(lo), max: q(hi) };
  return r.max > r.min ? r : { min: v[0], max: v[v.length - 1] };
}

// the dialog's blue - yellow - red ramp (t 0..1) -> [r, g, b]; rampColor is its CSS form
export function rampRGB(t) {
  t = Math.max(0, Math.min(1, t));
  if (t < 0.5) { const k = t / 0.5; return [Math.round(40 + k * 180), Math.round(70 + k * 150), Math.round(200 - k * 40)]; }
  const k = (t - 0.5) / 0.5;
  return [220, Math.round(220 - k * 170), Math.round(160 - k * 150)];
}
export const rampColor = (t) => { const [r, g, b] = rampRGB(t); return `rgb(${r}, ${g}, ${b})`; };

// world -> canvas px for a w x h map with `pad` px inside, north up
export function mapTransform(bounds, w, h, pad) {
  const kx = (w - 2 * pad) / (bounds.xmax - bounds.xmin || 1), ky = (h - 2 * pad) / (bounds.ymax - bounds.ymin || 1);
  return { kx, ky, toPx: (x, y) => [pad + (x - bounds.xmin) * kx, pad + (1 - (y - bounds.ymin) / (bounds.ymax - bounds.ymin || 1)) * (h - 2 * pad)], toWorld: (px, py) => [bounds.xmin + (px - pad) / kx, bounds.ymin + (1 - (py - pad) / (h - 2 * pad)) * (bounds.ymax - bounds.ymin || 1)] };
}

// The map. A Voronoi map is each pixel coloured by its nearest point: the pixels are filled from delaunay.find (walking from the last
// pixel's answer, so about one step each), whatever the point count. Filling 64 colour classes of 270,000 sub-pixel cells as canvas
// paths took 14 s in the worker. Then, for a few points only, the cells' white outlines and the points. CLASSES colour steps.
// ctx: a 2D canvas context of (w x h) x scale px; vmin / vrange: the colour stretch; onRow(done, total): progress
const CLASSES = 64;
export function drawDecluster(ctx, { delaunay, voronoi, xs, ys, vs, areas, bounds, w, h, pad, vmin, vrange, scale = 1, onRow = null }) {
  const n = xs.length, W = Math.round(w * scale), H = Math.round(h * scale);
  const img = ctx.createImageData(W, H), data = img.data;
  const pal = Array.from({ length: CLASSES }, (_, c) => rampRGB((c + 0.5) / CLASSES));
  const x0 = pad * scale, x1 = (w - pad) * scale, y0 = pad * scale, y1 = (h - pad) * scale;
  const bw = bounds.xmax - bounds.xmin, bh = bounds.ymax - bounds.ymin;
  let last = 0;
  for (let py = Math.ceil(y0); py < y1; py++) {
    const wy = bounds.ymax - ((py + 0.5 - y0) / (y1 - y0)) * bh;
    for (let px = Math.ceil(x0); px < x1; px++) {
      const i = delaunay.find(bounds.xmin + ((px + 0.5 - x0) / (x1 - x0)) * bw, wy, last);
      last = i;
      const v = vs[i];
      if (!Number.isFinite(v)) continue;
      const rgb = pal[Math.min(CLASSES - 1, Math.max(0, Math.floor(((v - vmin) / vrange) * CLASSES)))], o = (py * W + px) * 4;
      data[o] = rgb[0]; data[o + 1] = rgb[1]; data[o + 2] = rgb[2]; data[o + 3] = 217; // the old cells' 0.85 opacity
    }
    if (onRow && (py & 63) === 0) onRow(py, H);
  }
  ctx.putImageData(img, 0, 0);
  if (n <= DRAW_POINTS_UPTO) {
    const { kx, ky } = mapTransform(bounds, w, h, pad);
    ctx.setTransform(kx * scale, 0, 0, -ky * scale, (pad - bounds.xmin * kx) * scale, (h - pad + bounds.ymin * ky) * scale);
    ctx.beginPath();
    for (let i = 0; i < n; i++) if (areas[i] > 0) voronoi.renderCell(i, ctx);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.strokeStyle = "#ffffff"; ctx.lineWidth = scale; ctx.stroke();
    const t = mapTransform(bounds, w, h, pad);
    ctx.fillStyle = "#ffffff"; ctx.strokeStyle = "#1a2028"; ctx.lineWidth = 0.75 * scale;
    for (let i = 0; i < n; i++) { const [x, y] = t.toPx(xs[i], ys[i]); ctx.beginPath(); ctx.arc(x * scale, y * scale, 2 * scale, 0, 2 * Math.PI); ctx.fill(); ctx.stroke(); }
  }
}
