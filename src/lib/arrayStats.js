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
