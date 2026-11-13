// TASKS.csv #3065 — the "nearest drilling was never sampled" flag (#2596) on a block model's blocks is set when the model is estimated.
// Before #3006, an estimate made from the checked holes alone tested EVERY collar for unsampled drilling, so each unchecked hole counted as
// drilling with no sample and flagged the blocks near it. A model estimated then keeps those flags until it is estimated again; the pit
// tools read them. New estimates record which holes the test used (params.nearUnsampledHoles), so an old one can be told apart. Pure.
export const NEAR_UNSAMPLED_HOLES = "the holes the estimate used"; // params.nearUnsampledHoles (project data: English)

// true when the model's flags may be stale: flagged, estimated from the checked holes, and made before the test was limited to them
export function nearUnsampledMayBeStale(params) {
  if (!params || !params.nearUnsampledFlagged || params.nearUnsampledHoles) return false;
  return /^holes checked/i.test(String(params.samplesFrom || ""));
}
