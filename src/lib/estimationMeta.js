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
// TASKS.csv #1074 (review #1016) — the "3D view cell budget" (imported OMF / UBC / block-model CSV voxels) stops at the
// same 2 million: the number field's max was only a spinner hint, so one extra zero (10 million) was taken as typed,
// ~3.3 GB in the window plus 0.7 GB of drawing buffers at the #661 figures. null / not a number -> null (the default).
export const MIN_CELL_BUDGET = 10000;
export const clampCellBudget = (v) => (Number.isFinite(v) && v > 0 ? Math.min(MAX_BLOCK_MODEL_BUDGET, Math.max(MIN_CELL_BUDGET, Math.round(v))) : null);
// TASKS.csv #1970 — the budget is a setting of this computer (what its memory and GPU can take), remembered across restarts;
// null (the default) is stored as no key. A private window or blocked storage keeps it for the session only.
export const CELL_BUDGET_KEY = "geostrix.voxelCellBudget";
const storageOr = (s) => s ?? (typeof localStorage !== "undefined" ? localStorage : null);
export function readCellBudget(storage) { try { return clampCellBudget(Number(storageOr(storage)?.getItem(CELL_BUDGET_KEY))); } catch { return null; } }
export function saveCellBudget(v, storage) { try { const c = clampCellBudget(v), st = storageOr(storage); if (c == null) st?.removeItem(CELL_BUDGET_KEY); else st?.setItem(CELL_BUDGET_KEY, String(c)); } catch { /* session only */ } }
export const blockModelBudgetNote = (b) => (b <= 200000 ? "fast, ~0.1 GB of memory" : b <= 1000000 ? "~40 s, ~0.4 GB of memory" : "~1.5 min, ~0.9 GB of memory");
// TASKS.csv #1416 (review #1352) — the grade shell's budget menu in the same form, so the two menus read alike. Its grid is a
// Float64 value per block plus a 5-byte support code and index (estimateDenseGrid): ~13 MB per million, not the block model's
// ~0.4 GB. Times from #625: 1.09 million blocks 18 s, 2.7 million 51 s, 5 million ~150 s (radius 50 m; a larger search is slower).
export const gradeShellBudgetNote = (b) => (b <= 200000 ? "fast, ~3 MB of memory" : b <= 1000000 ? "~20 s, ~13 MB of memory" : b <= 2000000 ? "~40 s, ~26 MB of memory" : "~2.5 min, ~65 MB of memory");
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
  { id: "ok", label: "Ordinary kriging", exact: true, blurb: "Weights the composites by the variogram (how fast grade stops being alike with distance) and by how they cluster, so a tight group of holes does not count as many independent ones. Gives a kriging variance per block: how well the samples' layout constrains that block under the variogram, not how wrong the grade may be. Point kriging at the block centre; no block discretization." },
  { id: "mls1", label: "Moving least squares (linear)", exact: true, blurb: "Fits a local plane through the neighbourhood instead of averaging it, so it reproduces a genuine grade TREND across a dipping unit rather than flattening into the bullseyes IDW produces around each hole. Falls back to IDW² where the local geometry is degenerate (e.g. all samples down one hole), and is clamped to the local sample range so a fitted plane can never extrapolate a grade the data never saw." },
];

// TASKS.csv #724 — a block model's regular lattice: its cell size and an origin its block corners sit on, read from its
// cells (x / y / z centres, dx / dy / dz). null when the cells are not one regular grid (mixed sizes, e.g. a merged or
// octree model, or centres off the lattice) — matching it would not line the centroids up.
export function blockModelLattice(model) {
  const cells = model?.cells;
  if (!cells?.length) return null;
  const c0 = cells[0];
  const { dx, dy, dz } = c0;
  if (![dx, dy, dz].every((d) => Number.isFinite(d) && d > 0)) return null;
  const ox = c0.x - dx / 2, oy = c0.y - dy / 2, oz = c0.z - dz / 2;
  const off = (v, o, d) => { const k = (v - o) / d - 0.5; return Math.abs(k - Math.round(k)); };
  const step = Math.max(1, Math.floor(cells.length / 2000)); // a sample is enough
  for (let i = 0; i < cells.length; i += step) {
    const c = cells[i];
    if (Math.abs(c.dx - dx) > 1e-6 * dx || Math.abs(c.dy - dy) > 1e-6 * dy || Math.abs(c.dz - dz) > 1e-6 * dz) return null;
    if (off(c.x, ox, dx) > 1e-3 || off(c.y, oy, dy) > 1e-3 || off(c.z, oz, dz) > 1e-3) return null;
  }
  return { dx, dy, dz, ox, oy, oz };
}
// The box grown outward to whole cells of the lattice: block centres then coincide with the lattice's centres.
// TASKS.csv #2729 (split from #2598) — a block model's own box (its cells' extent), so an estimate matched to it lands on the same blocks,
// not on its lattice over the data's box. -> { xmin, xmax, ymin, ymax, zmin, zmax } or null
export function blockModelExtent(model) {
  const cells = model?.cells;
  if (!cells?.length) return null;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const c of cells) {
    if (![c.x, c.y, c.z, c.dx, c.dy, c.dz].every(Number.isFinite)) continue;
    x0 = Math.min(x0, c.x - c.dx / 2); x1 = Math.max(x1, c.x + c.dx / 2); y0 = Math.min(y0, c.y - c.dy / 2); y1 = Math.max(y1, c.y + c.dy / 2); z0 = Math.min(z0, c.z - c.dz / 2); z1 = Math.max(z1, c.z + c.dz / 2);
  }
  return x1 > x0 && y1 > y0 && z1 > z0 ? { xmin: x0, xmax: x1, ymin: y0, ymax: y1, zmin: z0, zmax: z1 } : null;
}
export function snapBoundsToLattice(b, L) {
  const lo = (v, o, d) => o + Math.floor((v - o) / d + 1e-9) * d, hi = (v, o, d) => o + Math.ceil((v - o) / d - 1e-9) * d;
  return { xmin: lo(b.xmin, L.ox, L.dx), xmax: hi(b.xmax, L.ox, L.dx), ymin: lo(b.ymin, L.oy, L.dy), ymax: hi(b.ymax, L.oy, L.dy), zmin: lo(b.zmin, L.oz, L.dz), zmax: hi(b.zmax, L.oz, L.dz) };
}

// TASKS.csv #1570 — the overlap of two boxes, or null when they do not overlap
export function overlapBox(a, b) {
  const o = { xmin: Math.max(a.xmin, b.xmin), xmax: Math.min(a.xmax, b.xmax), ymin: Math.max(a.ymin, b.ymin), ymax: Math.min(a.ymax, b.ymax), zmin: Math.max(a.zmin, b.zmin), zmax: Math.min(a.zmax, b.zmax) };
  return o.xmin < o.xmax && o.ymin < o.ymax && o.zmin < o.zmax ? o : null;
}
// TASKS.csv #1416 — the grade shell's starting cell size (m): left at it, an over-budget run takes the cell size that fits instead
export const NUMERIC_CELL_DEFAULT = 10;
