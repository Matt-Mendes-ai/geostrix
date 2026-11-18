// TASKS.csv #552 — estimation.js's constants (the method table, data-support colours, the block cap), which the
// 3D view needs at startup; the estimator itself loads when an estimate or grade shell is run.

export const MAX_BLOCKS = 200000; // keeps a synchronous brute-force estimation pass responsive — see estimateBlockModel
// TASKS.csv #625 — the grade shell's block budget can be raised (it runs in a worker since #520, with progress and
// Cancel). 5 million is the ceiling: memory stays modest on an 8 GB laptop and the run is minutes, not hours.
// TASKS.csv #3581 (Matt, with #3580: "let's give higher cell budget options, up to 50 million") — 10, 20 and 50 million, offered where this
// computer's memory allows (gradeShellBudgetMB below against lib/fetchMemory.js's share of it); the grid stays under blockReach's REACH_MAX_GRID (64 M).
export const BLOCK_BUDGETS = [200000, 1000000, 2000000, 5000000, 10000000, 20000000, 50000000];
export const MAX_BLOCK_BUDGET = 50000000;
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
// TASKS.csv #3256 (Galore Creek review) — memory only: the time depends on the search radius and the composites in reach as much as on the
// blocks ("200,000 blocks (fast)" ran over five minutes at a 500 m search on 14 holes); the run says its own time left as it goes
export const blockModelBudgetNote = (b) => (b <= 200000 ? "~0.1 GB of memory" : b <= 1000000 ? "~0.4 GB of memory" : "~0.9 GB of memory");
// TASKS.csv #1416 (review #1352) — the grade shell's budget menu in the same form, so the two menus read alike. Its grid is a
// Float64 value per block plus a 5-byte support code and index (estimateDenseGrid): ~13 MB per million, not the block model's
// ~0.4 GB. Times from #625: 1.09 million blocks 18 s, 2.7 million 51 s, 5 million ~150 s (radius 50 m; a larger search is slower).
// TASKS.csv #3581 — 10, 20 and 50 million: the same rate (#625: about 30 s per million where most of the box is within the search; much less
// where little of it is, 50 million over Macpass's 27 x 18 km in 18 s), and the memory measured at its peak with the cut and the iso-surface
// (Macpass, Node: 19.5 million blocks 450 MB, 49 million 990 MB, about 21 bytes per block; 24 taken). The cut at the ground and the
// iso-surface ran in the window then (8 s at 20 million, 17 s at 50 million); since #3580 (b) they run in the worker.
// TASKS.csv #3654 (5) — re-timed on the build after #3580 (b) / #3655 (Macpass, the whole property, Ag, 10 m cells, ~4 million nodes): 29-58 s
// (Review 50-58 s), the longest window pause 0.12-0.43 s; the 'window pauses ... at the end' clauses are gone. The 10 / 20 / 50 million
// times stay upper bounds, not re-measured (the development machine was at 100 % CPU then).
// TASKS.csv #3666 (2026-11-17) — 10, 20 and 50 million re-timed on a quiet-ish 32 GB machine (the CPU averaged 42-76 %, OneDrive syncing), in a visible window, each budget on a larger
// grid than the last (Macpass, the whole property, Ag, 80 m search; the nodes are all the drilled areas' grids): 3.95 million nodes 44 s (+166 MB), 9.35 million 78 s (+289 MB), 18.3 million
// 200 s (+350 MB), 46.4 million 628 s (+811 MB: the Electron processes' working set above the idle app's 700 MB). Labelled with a margin of 1.5-2 x for the modest laptops this is
// for: '~1 min', 'up to ~3 min', 'up to ~6 min', 'up to ~20 min'; the memory is the growth measured, and a 50 million run says it needs a computer with 8 GB or more.
export const gradeShellBudgetNote = (b) => (b <= 200000 ? "fast, ~3 MB of memory" : b <= 1000000 ? "~20 s, ~13 MB of memory" : b <= 2000000 ? "~40 s, ~26 MB of memory" : b <= 5000000 ? "~1 min, about 0.2 GB more memory"
  : b <= 10000000 ? "up to ~3 min, about 0.3 GB more memory" : b <= 20000000 ? "up to ~6 min, about 0.35 GB more memory" : "up to ~20 min, about 0.8 GB more memory; needs a computer with 8 GB or more");
export const SHELL_BYTES_PER_BLOCK = 24;
export const gradeShellBudgetMB = (b) => Math.ceil((b * SHELL_BYTES_PER_BLOCK) / 1e6);
// the budgets offered on a computer: up to 5 million always (as before #3581), the larger ones where fits(MB) says this computer's memory can
// take them (lib/fetchMemory.js fetchFits with its total memory: a quarter of it)
export const shellBudgetsFor = (fits) => BLOCK_BUDGETS.filter((b) => b <= 5000000 || fits(gradeShellBudgetMB(b)));
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
// Matt, 2026-11-20 (#3920 follow-up, from his Grade shell settings): 'should have this as default even if it means increasing cell budget to
// 1000000' — cell 50 m (was 10), search 200 m (was 50), pad 25 m, the Tight shell searched along the composites' plane, a 1,000,000-block budget
// (was 200,000). GeoStrix's standard settings, said as such (#264); a budget, shell kind or plane setting the user saved stays theirs.
export const NUMERIC_CELL_DEFAULT = 50;
export const GRADE_SHELL_SEARCH_DEFAULT = 200, GRADE_SHELL_PAD_DEFAULT = 25, GRADE_SHELL_BLOCK_BUDGET = 1000000, GRADE_SHELL_MODE_DEFAULT = "tight";
