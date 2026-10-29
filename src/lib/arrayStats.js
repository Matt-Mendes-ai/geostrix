// TASKS.csv #371 — loop-based replacements for Math.min(...arr) / Math.max(...arr). A spread passes every
// element as a separate call argument, and V8 throws "Maximum call stack size exceeded" somewhere above
// ~120k-150k elements (measured) — an airborne .xyz survey, an inversion result with ~187k cells or a
// project's assay column is well past that, so a successful long run could fail at the very end. These
// keep Math.min/Math.max semantics exactly (empty -> Infinity / -Infinity, any NaN -> NaN) so swapping
// them in can't change a result; layers.js's minMax is the finite-only variant for colour ranges.
export function arrMin(arr) {
  let m = Infinity;
  for (let i = 0; i < arr.length; i++) {
    const v = +arr[i];
    if (v !== v) return NaN;
    if (v < m) m = v;
  }
  return m;
}
export function arrMax(arr) {
  let m = -Infinity;
  for (let i = 0; i < arr.length; i++) {
    const v = +arr[i];
    if (v !== v) return NaN;
    if (v > m) m = v;
  }
  return m;
}

// TASKS.csv #740 — one percentile. There were eight copies with three index rules (floor(p*n), floor(p*(n-1)),
// round(p*(n-1))), so a filtered raster stretched differently from an imported one. This is makeStretch's rule (#708):
// the value nearest position p*(n-1) of the sorted list, p in 0..1. percentile() sorts a copy of the finite values.
// (The length-weighted quantiles in geochem.js / GradeStatistics are a different statistic and stay separate.)
export function percentileSorted(sorted, p) {
  const n = sorted.length;
  if (!n) return NaN;
  return sorted[Math.min(n - 1, Math.max(0, Math.round(p * (n - 1))))];
}
export function percentile(values, p) {
  const s = [];
  for (let i = 0; i < values.length; i++) if (Number.isFinite(values[i])) s.push(+values[i]);
  return percentileSorted(s.sort((a, b) => a - b), p);
}

// TASKS.csv #1114 — one interpolating quantile and one median. Three identical linear-interpolation quantiles had grown
// up beside percentile() (thresholds.js, ensembleProbability.js, evidence.js) and seven medians, two of which took the
// upper-middle value of an even count (stackOrder.js, voxelSample.js). Hyndman & Fan type 7 (the spreadsheet / R
// default); p in 0..1. quantileSorted() takes an ascending array; the others keep the finite values of a copy.
export function quantileSorted(s, p) {
  if (!s.length) return NaN;
  const h = (s.length - 1) * p, lo = Math.floor(h), hi = Math.ceil(h);
  return s[lo] + (h - lo) * (s[hi] - s[lo]);
}
const finiteSorted = (values) => {
  const s = [];
  for (let i = 0; i < values.length; i++) if (Number.isFinite(values[i])) s.push(+values[i]);
  return s.sort((a, b) => a - b);
};
export const quantileLinear = (values, p) => quantileSorted(finiteSorted(values), p);
export const median = (values) => quantileSorted(finiteSorted(values), 0.5); // the mean of the two middle values for an even count; NaN when empty
