// TASKS.csv #2462 (review #2325, WA uranium) — the contour interval a terrain opens with, from its own relief: the form opened at 50 m, so
// the first click drew nothing on any project with under 50 m of relief (WA: 318-347 m), and 0.5 / 0.25 were clamped to 1 without a word.
// A 1-2-5 step near range / 12 (about 10-20 levels), at least MIN_CONTOUR_INTERVAL. Pure.
import { terrainNodeIsFill } from "./viewer/geomath.js";

export const MIN_CONTOUR_INTERVAL = 0.1;

export function niceContourInterval(min, max, levels = 12) {
  const range = Number(max) - Number(min);
  if (!(range > 0) || !Number.isFinite(range)) return 10;
  const raw = range / levels, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
  const step = (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
  return Math.max(MIN_CONTOUR_INTERVAL, +step.toPrecision(3));
}

// the terrain's real elevations (no-data fill left out, #1619 / #927) -> [min, max] or null
export function terrainRange(terrain) {
  const e = terrain?.elevations;
  if (!e?.length) return null;
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < e.length; i++) {
    const v = e[i];
    if (!Number.isFinite(v) || (terrain.noDataMask && terrainNodeIsFill(terrain, i))) continue;
    if (v < lo) lo = v; if (v > hi) hi = v;
  }
  return Number.isFinite(lo) ? [lo, hi] : null;
}
