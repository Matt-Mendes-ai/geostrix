// TASKS.csv #2836 / #2844 (GSC geophysics review) — the contour levels a raster card proposes. lib/sampleGrid.js suggestedContourLevels was
// written for soil geochemistry (#1622): the 75 / 90 / 95 / 98th percentiles of the POSITIVE values, the upper tail an anomaly map wants.
// On a geophysics grid that is wrong: on Bathurst magnetics (91 % of cells at or below zero) it proposed the 97.8–99.8th percentiles and no
// low, and on a Bouguer grid (all negative) nothing at all, while the tooltip promised 'the grid's percentiles'. A field grid (magnetics,
// gravity, a derivative, an elevation…) is now offered a round interval across its 2–98 % range, lows and highs alike, with the zero line
// on a signed grid (lib/contourInterval.js's 1-2-5 step, as terrain contours use). The box also takes 'every 5'. Pure.
import { niceContourInterval } from "./contourInterval.js";

// the values' 2nd and 98th percentiles -> [lo, hi] | null
export function p2p98(values) {
  const v = [];
  for (let i = 0; i < (values || []).length; i++) if (Number.isFinite(values[i])) v.push(values[i]);
  if (!v.length) return null;
  v.sort((a, b) => a - b);
  const at = (p) => v[Math.min(v.length - 1, Math.round(p * (v.length - 1)))];
  return [at(0.02), at(0.98)];
}
// every multiple of `interval` inside [lo, hi] (a zero among them on a signed range), at most `max` of them
export function levelsEvery(interval, lo, hi, max = 60) {
  const d = Number(interval);
  if (!(d > 0) || !(hi >= lo)) return [];
  const a = Math.ceil(lo / d), b = Math.floor(hi / d);
  if (b - a + 1 > max) return [];
  const dec = Math.max(0, -Math.floor(Math.log10(d)) + 1);
  const out = [];
  for (let k = a; k <= b; k++) out.push(+(k * d).toFixed(dec));
  return out;
}
// a field grid's proposal: { interval, levels, range } | null
export function fieldContourLevels(values) {
  const r = p2p98(values);
  if (!r || !(r[1] > r[0])) return null;
  const interval = niceContourInterval(r[0], r[1], 10);
  return { interval, levels: levelsEvery(interval, r[0], r[1]), range: r };
}
// 'every 5' / 'every 0.5' typed in the box -> 5 / 0.5, else null
export function everyInterval(text) {
  const m = /^\s*every\s+([0-9]*\.?[0-9]+)\s*$/i.exec(String(text || ""));
  return m && Number(m[1]) > 0 ? Number(m[1]) : null;
}
