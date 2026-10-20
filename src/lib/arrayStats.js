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
