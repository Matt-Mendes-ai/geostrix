// TASKS.csv #1236 — a raster's colours, chosen after import. They were baked into a PNG on the way in (viridis, 2-98 %): no way to read a resistivity low
// as ohm-m rather than "blue". The values kept with the raster (grid, at most GRID_MAX nodes a side) are coloured again on demand; the default style draws what
// the importer drew. A raster with no grid (an RGB image, or one reprojected on the way in) has no values to colour.
import { makeStretch } from "./idw.js";
import { PALETTES } from "./layers.js";
import { hexToRgb } from "./colorRamp.js";

export const RASTER_RAMPS = ["viridis", "rainbow", "geosoft", "spectrum", "resistivity", "diverging", "grayscale"];
export const DEFAULT_RASTER_STYLE = { palette: "viridis", stretch: "p2-98", invert: false };

const anchorsOf = (palette) => (PALETTES[palette] || PALETTES.viridis).colors.map(hexToRgb);
export function rampRgb(anchors, t) {
  const n = anchors.length - 1;
  if (n < 1) return anchors[0];
  const seg = Math.min(n - 1, Math.max(0, Math.floor(t * n))), f = t * n - seg, a = anchors[seg], b = anchors[seg + 1];
  return [Math.round(a[0] + (b[0] - a[0]) * f), Math.round(a[1] + (b[1] - a[1]) * f), Math.round(a[2] + (b[2] - a[2]) * f)];
}

// stretch: makeStretch's "p2-98" | "linear" | "equalise", or "custom" with style.min and style.max -> { lo, hi, t }
export function rasterRange(values, style) {
  if (style.stretch === "custom" && Number.isFinite(style.min) && Number.isFinite(style.max) && style.max > style.min) {
    const { min: lo, max: hi } = style;
    return { lo, hi, t: (x) => Math.min(1, Math.max(0, (x - lo) / (hi - lo))) };
  }
  return makeStretch(values, style.stretch === "custom" ? "p2-98" : style.stretch);
}

// Row 0 = north, as the grid and the image both are; a blank node is transparent. -> { rgba, lo, hi }
export function rasterRGBA(values, style) {
  const anchors = anchorsOf(style.palette), { lo, hi, t } = rasterRange(values, style);
  const rgba = new Uint8ClampedArray(values.length * 4);
  for (let k = 0; k < values.length; k++) {
    const v = values[k];
    if (!Number.isFinite(v)) continue;
    const u = t(v), [r, g, b] = rampRgb(anchors, style.invert ? 1 - u : u);
    rgba[k * 4] = r; rgba[k * 4 + 1] = g; rgba[k * 4 + 2] = b; rgba[k * 4 + 3] = 255;
  }
  return { rgba, lo, hi };
}

// The ramp as stops over the values, for the legend. Equalized colours do not scale with the value, so its legend says so.
export function rasterStops(style, lo, hi) {
  const anchors = anchorsOf(style.palette), n = anchors.length - 1;
  const hex = (c) => `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  return anchors.map((_, i) => ({ value: lo + (i / n) * (hi - lo), color: hex(anchors[style.invert ? n - i : i]) }));
}
// -> the raster fields a style sets, to pass to updateRaster
export function rasterColourFields(values, nx, ny, style) {
  const { rgba, lo, hi } = rasterRGBA(values, style);
  const canvas = document.createElement("canvas");
  canvas.width = nx; canvas.height = ny;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(nx, ny);
  img.data.set(rgba);
  ctx.putImageData(img, 0, 0);
  return { dataUrl: canvas.toDataURL("image/png"), colourStyle: style, colourRange: [lo, hi], colourStops: rasterStops(style, lo, hi) };
}
