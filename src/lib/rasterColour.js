// TASKS.csv #1236 — a raster's colours, chosen after import. They were baked into a PNG on the way in (viridis, 2-98 %): no way to read a resistivity low
// as ohm-m rather than "blue". The values kept with the raster (grid, at most GRID_MAX nodes a side) are coloured again on demand; the default style draws what
// the importer drew. A raster with no grid (an RGB image, or one reprojected on the way in) has no values to colour.
import { makeStretch } from "./idw.js";
import { PALETTES } from "./layers.js";
import { hexToRgb } from "./colorRamp.js";

export const RASTER_RAMPS = ["viridis", "rainbow", "geosoft", "spectrum", "resistivity", "diverging", "grayscale"];
// #1857 — how many decades the positive values span between their 2nd and 98th percentiles (the log stretch is suggested past one: a factor of ten)
// TASKS.csv #2555 (review #2486) — and 0 on a SIGNED grid: Bouguer gravity, RTP, 1VD and tilt were offered 'Log (suggested: 1.6-4.0
// decades)' from their positive half, and the log stretch then painted every cell at or below zero (the gravity low, the target) one colour
export const LOG_NONPOSITIVE_MAX = 0.05;
export function decadesSpanned(values) {
  if (signedGridHint(values).nonPositive > LOG_NONPOSITIVE_MAX) return 0;
  const { lo, hi, log } = makeStretch(values, "log");
  return log ? Math.log10(hi / lo) : 0;
}
// the share of the valid cells at or below zero; straddles: at least 5 % of them on each side of zero, so a diverging ramp centred on zero
// reads (symMax: the larger of |2nd| and |98th percentile|, the symmetric range)
export function signedGridHint(values) {
  const v = [];
  for (let i = 0; i < (values?.length || 0); i++) if (Number.isFinite(values[i])) v.push(values[i]);
  if (!v.length) return { nonPositive: 0, straddles: false, symMax: null };
  let neg = 0, nonPos = 0;
  for (const x of v) { if (x <= 0) nonPos++; if (x < 0) neg++; }
  const pos = v.length - nonPos, { lo, hi } = makeStretch(values, "p2-98");
  const straddles = neg / v.length >= LOG_NONPOSITIVE_MAX && pos / v.length >= LOG_NONPOSITIVE_MAX;
  return { nonPositive: nonPos / v.length, straddles, symMax: straddles ? Math.max(Math.abs(lo), Math.abs(hi)) : null };
}
export const DEFAULT_RASTER_STYLE = { palette: "viridis", stretch: "p2-98", invert: false };

const anchorsOf = (palette) => (PALETTES[palette] || PALETTES.viridis).colors.map(hexToRgb);
export function rampRgb(anchors, t) {
  const n = anchors.length - 1;
  if (n < 1) return anchors[0];
  const seg = Math.min(n - 1, Math.max(0, Math.floor(t * n))), f = t * n - seg, a = anchors[seg], b = anchors[seg + 1];
  return [Math.round(a[0] + (b[0] - a[0]) * f), Math.round(a[1] + (b[1] - a[1]) * f), Math.round(a[2] + (b[2] - a[2]) * f)];
}

// stretch: makeStretch's "p2-98" | "linear" | "equalise" | "log" (#1857), or "custom" with style.min and style.max -> { lo, hi, t, log? }
export function rasterRange(values, style) {
  if (style.stretch === "custom" && Number.isFinite(style.min) && Number.isFinite(style.max) && style.max > style.min) {
    const { min: lo, max: hi } = style;
    return { lo, hi, t: (x) => Math.min(1, Math.max(0, (x - lo) / (hi - lo))) };
  }
  return makeStretch(values, style.stretch === "custom" ? "p2-98" : style.stretch);
}

// Row 0 = north, as the grid and the image both are; a blank node is transparent. -> { rgba, lo, hi }
export function rasterRGBA(values, style) {
  const anchors = anchorsOf(style.palette), { lo, hi, t, log } = rasterRange(values, style);
  const rgba = new Uint8ClampedArray(values.length * 4);
  for (let k = 0; k < values.length; k++) {
    const v = values[k];
    if (!Number.isFinite(v)) continue;
    const u = t(v), [r, g, b] = rampRgb(anchors, style.invert ? 1 - u : u);
    rgba[k * 4] = r; rgba[k * 4 + 1] = g; rgba[k * 4 + 2] = b; rgba[k * 4 + 3] = 255;
  }
  return { rgba, lo, hi, log: !!log };
}

// The ramp as stops over the values, for the legend. Equalized colours do not scale with the value, so its legend says so.
// #1857 — a log stretch's stops are log-spaced, which the legend reads as a log bar with decade ticks (legendScale's stopsAreLogSpaced)
export function rasterStops(style, lo, hi, log = false) {
  const anchors = anchorsOf(style.palette), n = anchors.length - 1;
  const hex = (c) => `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  return anchors.map((_, i) => ({ value: log && lo > 0 && hi > lo ? lo * (hi / lo) ** (i / n) : lo + (i / n) * (hi - lo), color: hex(anchors[style.invert ? n - i : i]) }));
}
// -> the raster fields a style sets, to pass to updateRaster
export function rasterColourFields(values, nx, ny, style) {
  const { rgba, lo, hi, log } = rasterRGBA(values, style);
  const canvas = document.createElement("canvas");
  canvas.width = nx; canvas.height = ny;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(nx, ny);
  img.data.set(rgba);
  ctx.putImageData(img, 0, 0);
  return { dataUrl: canvas.toDataURL("image/png"), colourStyle: style, colourRange: [lo, hi], colourStops: rasterStops(style, lo, hi, log) };
}

// TASKS.csv #2866 (review GSC geophysics) — a range value at 4 significant figures: Number(v.toPrecision(4)).toLocaleString() then cut it to
// 3 decimals (0.000478 read '0', 0.000574 '0.001'; the import notice and the Layout legend gave 0.000478)
export const rangeValueText = (v) => (v == null || !Number.isFinite(v) ? "—" : v === 0 ? "0" : v.toLocaleString(undefined, { maximumSignificantDigits: 4 }));

// TASKS.csv #2851 (review GSC geophysics) — the share of the valid cells exactly at the grid's minimum (tau: 44.8 % at 46, the instrument's
// floor): when large, that colour is 'no response', not a low reading. -> { share, min, n } or null
export const FLOOR_SHARE_MIN = 0.2;
export function floorShare(values) {
  let min = Infinity, n = 0;
  for (const v of values || []) if (Number.isFinite(v)) { n++; if (v < min) min = v; }
  if (!n) return null;
  let at = 0;
  for (const v of values) if (v === min) at++;
  return { share: at / n, min, n };
}
