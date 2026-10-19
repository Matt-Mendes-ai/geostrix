// TASKS.csv #552 — estimation.js's constants (the method table, data-support colours, the block cap), which the
// 3D view needs at startup; the estimator itself loads when an estimate or grade shell is run.

export const MAX_BLOCKS = 200000; // keeps a synchronous brute-force estimation pass responsive — see estimateBlockModel
// TASKS.csv #625 — the grade shell's block budget can be raised (it runs in a worker since #520, with progress and
// Cancel). 5 million is the ceiling: memory stays modest on an 8 GB laptop and the run is minutes, not hours.
export const BLOCK_BUDGETS = [200000, 1000000, 2000000, 5000000];
export const MAX_BLOCK_BUDGET = 5000000;
// TASKS.csv #661 — a BLOCK MODEL (the estimation modal) is one object per block, held in the worker and again in the
// renderer: measured 243-295 bytes per block in each, plus a ~5 s structured-clone hand-back per million and 72 MB of
// instance buffers per million drawn. At 5 million that is 1.2-1.5 GB twice — more than an 8 GB laptop can spare.
// The worker now returns typed columns (estimationCells.js), transferred: at ~950k blocks the worker holds 101 MB
// instead of 276 MB, the 2.7 s clone is gone and the window builds its objects in 0.17 s. The window still keeps one
// object per block (~330 bytes, read by 61 places in the app), so block models stop at 2 million (~0.9 GB with the
// drawing buffers); the grade shell's dense grid is a Float64Array (40 MB at 5 million) and keeps BLOCK_BUDGETS.
export const BLOCK_MODEL_BUDGETS = [200000, 1000000, 2000000];
export const MAX_BLOCK_MODEL_BUDGET = 2000000;
// what each block-model budget costs, for the menu (measured: ~330 B per block in the window + 72 MB per million drawn)
export const blockModelBudgetNote = (b) => (b <= 200000 ? "fast, ~0.1 GB of memory" : b <= 1000000 ? "~40 s, ~0.4 GB of memory" : "~1.5 min, ~0.9 GB of memory");
// the grid a box needs at a cell size (the same rounding as estimation.js's gridDims), and the smallest cell (to
// 0.5 m) that keeps a box within a budget
export function gridBlockCount(bounds, cell) {
  const n = (a, b) => Math.max(1, Math.round((b - a) / Math.max(0.01, cell)));
  return n(bounds.xmin, bounds.xmax) * n(bounds.ymin, bounds.ymax) * n(bounds.zmin, bounds.zmax);
}
export function cellToFit(bounds, budget, from = 0.5) {
  let c = Math.max(0.5, from);
  while (gridBlockCount(bounds, c) > budget && c < 1e5) c = Math.ceil((c * 1.02) * 2) / 2;
  return c;
}

export const SUPPORT_COLORS = { interpolated: "#3faf5a", extrapolated: "#e0a92b", unsupported: "#cc4b3c" };

export const ESTIMATION_METHODS = [
  { id: "nn", label: "Nearest neighbour", exact: true, blurb: "Takes the nearest composite's value outright. No smoothing, no new values invented — the honest quick-look / validation-of-declustering method, and the usual sanity check against a smoothed estimate." },
  { id: "idw1", label: "Inverse distance (power 1)", exact: true, blurb: "Gentlest distance decay — the smoothest, most continuous option. Suits broad, low-variance, laterally continuous units (a sedimentary horizon, a disseminated halo)." },
  { id: "idw2", label: "Inverse distance (power 2)", exact: true, blurb: "The general-purpose default. A reasonable compromise between honouring nearby data and smoothing across a neighbourhood." },
  { id: "idw3", label: "Inverse distance (power 3)", exact: true, blurb: "Sharp distance decay — nearby composites dominate. Suits narrow, high-contrast, discontinuous bodies (a vein, a massive-sulphide lens) where grade should not be smeared far from the hole that saw it." },
  // TASKS.csv #709 — ordinary kriging with a variogram model (entered, or fitted to the same composites at run time)
  { id: "ok", label: "Ordinary kriging", exact: true, blurb: "Weights the composites by the variogram (how fast grade stops being alike with distance) and by how they cluster, so a tight group of holes does not count as many independent ones. Gives a kriging variance per block: how well the samples' layout constrains that block under the variogram, not how wrong the grade may be. Point kriging at the block centre; no block discretisation." },
  { id: "mls1", label: "Moving least squares (linear)", exact: true, blurb: "Fits a local plane through the neighbourhood instead of averaging it, so it reproduces a genuine grade TREND across a dipping unit rather than flattening into the bullseyes IDW produces around each hole. Falls back to IDW² where the local geometry is degenerate (e.g. all samples down one hole), and is clamped to the local sample range so a fitted plane can never extrapolate a grade the data never saw." },
];
