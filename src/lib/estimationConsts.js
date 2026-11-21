// TASKS.csv #3961 (startup size) — the few estimation figures the 3D View and the store need at startup, out of lib/estimationMeta.js so
// the rest of it (the methods and their descriptions, the budget menus, the lattice helpers) loads with the tools that use it; estimationMeta.js
// re-exports these, unchanged.
export const MAX_BLOCK_MODEL_BUDGET = 2000000;
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

export const SUPPORT_COLORS = { interpolated: "#3faf5a", extrapolated: "#e0a92b", unsupported: "#cc4b3c" };

// TASKS.csv #1416 — the grade shell's starting cell size (m): left at it, an over-budget run takes the cell size that fits instead
// Matt, 2026-11-20 (#3920 follow-up, from his Grade shell settings): 'should have this as default even if it means increasing cell budget to
// 1000000' — cell 50 m (was 10), search 200 m (was 50), pad 25 m, the Tight shell searched along the composites' plane, a 1,000,000-block budget
// (was 200,000). GeoStrix's standard settings, said as such (#264); a budget, shell kind or plane setting the user saved stays theirs.
export const NUMERIC_CELL_DEFAULT = 50;
export const GRADE_SHELL_SEARCH_DEFAULT = 200, GRADE_SHELL_PAD_DEFAULT = 25, GRADE_SHELL_BLOCK_BUDGET = 1000000, GRADE_SHELL_MODE_DEFAULT = "tight";
