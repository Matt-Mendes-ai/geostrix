// TASKS.csv #1699 (review #1645, Copley; Matt 2026-11-05: 'go with percentile clip') — an unclassified data-range numeric layer (SG, mag susc)
// was coloured minimum to maximum: Copley's mag susc runs -0.845 to 310 with 95 % of readings under 1.62, so the ramp was dark in its
// first 1 % and yellow everywhere else. Its default ramp now runs from the 2nd to the 98th percentile of the layer's values; values beyond
// take the end colours and the key says so ('≤' / '≥'). Minimum to maximum stays a per-layer choice (symbology { fullRange: true }); a
// layer with its own classes (stops) keeps them. RQD and recovery keep their fixed 0-100 % ramp.
import { quantileLinear } from "./arrayStats.js";
import { colorForVoxelValue, rqdColor, magColor } from "./layers.js"; // #1482

export const CLIP_KEYS = ["sg", "magsusc"];
const P_LO = 0.02, P_HI = 0.98;

// rows -> { lo, hi, min, max } over the finite values, or null with fewer than 2
export function numericClip(rows) {
  const v = [];
  let min = Infinity, max = -Infinity;
  for (const r of rows || []) { const x = r?.value; if (typeof x === "number" && Number.isFinite(x)) { v.push(x); if (x < min) min = x; if (x > max) max = x; } }
  if (v.length < 2) return null;
  const lo = quantileLinear(v, P_LO), hi = quantileLinear(v, P_HI);
  return hi > lo ? { lo, hi, min, max } : { lo: min, hi: max, min, max };
}
export function numericClips(layers) {
  const out = {};
  for (const k of CLIP_KEYS) { const c = numericClip(layers?.[k]); if (c) out[k] = c; }
  return out;
}
// the range a layer's default ramp spans: the clip, unless the layer asks for its full range (or has none)
export function rampRange(layerKey, sym, clips, range) {
  const c = clips?.[layerKey];
  if (!CLIP_KEYS.includes(layerKey) || sym?.fullRange || !c) return range;
  return { min: c.lo, max: c.hi, clipped: true };
}

// TASKS.csv #1482 — the colour of a numeric-log value as the 3D view draws it (ViewerModule's numericLayerColor), for Layout's
// 'Load from view' legend: the layer's own classes or ramp when it has them, RQD / recovery's fixed ramp, else viridis over rampRange
export function numericLayerColorFn(symbology = {}, clips = {}) {
  return (layerKey, value, range) => {
    const sym = symbology?.[layerKey];
    if (sym?.stops?.length) return colorForVoxelValue({ stops: sym.stops, colorMode: sym.colorMode, min: range?.min, max: range?.max }, value);
    if (layerKey === "geotech" || layerKey === "recovery") return rqdColor(value);
    const r = rampRange(layerKey, sym, clips, range);
    return magColor(value, r?.min ?? 0, r?.max ?? 0);
  };
}
