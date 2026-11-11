// TASKS.csv #1787 (review #1646, Kodiak) — a point survey spanning decades (AMT resistivity 1 to 9,886 ohm·m) was drawn on a linear viridis
// ramp between its 2-98 % limits, so most points were the darkest colour; block models get log colours by the #481 rule, point surveys
// had only Classify > Log-linear (stepped). A Linear / Log colour scale for a positive survey: Log is viridis on log-spaced stops, kept in
// the survey's legend stops (so the 3D View and the plan draw it as they draw any legend). Pure.
import { VIRIDIS_ANCHORS } from "./layers.js";
import { logStops } from "./inversion.js";

const hex = (rgb) => "#" + rgb.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("");
export const VIRIDIS_HEX = VIRIDIS_ANCHORS.map(hex);

// decades between two positive limits (null when either is not positive)
export const decadesBetween = (lo, hi) => (lo > 0 && hi > lo ? Math.log10(hi / lo) : null);

// stops drawn on a log scale: at least three, values strictly increasing with a near-constant ratio
export function isLogSpaced(stops) {
  const v = (stops || []).map((s) => s?.value);
  if (v.length < 3 || !v.every((x) => Number.isFinite(x) && x > 0)) return false;
  const r = v.slice(1).map((x, i) => x / v[i]);
  return r.every((q) => q > 1 && Math.abs(q / r[0] - 1) < 1e-3);
}

// the Log scale's stops between the survey's limits (its 2-98 % range unless edited)
export const logViridisStops = (lo, hi, n = 17) => logStops(lo, hi, VIRIDIS_HEX, n);
