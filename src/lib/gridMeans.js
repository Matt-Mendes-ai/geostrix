// TASKS.csv #2831 (GSC geophysics review A1) — a grid over GRID_MAX (512) nodes a side is kept as block MEANS (lib/raster.js makeValueGrid):
// Athabasca's eU peak of 417.5 ppm was kept as 67.7, and nothing above 167.3 existed anywhere, so 'Linear min-max', the colour bar and a
// 200 ppm contour all worked on means with no word. The import now also keeps each block's highest and lowest value and the range of the
// values it averaged (grid.maxValues / minValues / sourceRange); these helpers say so wherever a number of the kept grid is shown. Pure.
import { b64ToF32 } from "./inversion.js";
import { t as tr } from "./i18n.js";

const fmt = (v) => (Number.isFinite(v) ? Number(v.toPrecision(4)).toLocaleString() : "—");

// the kept grid's own range (its block means), finite values only
export function meanRange(values) {
  let lo = Infinity, hi = -Infinity;
  for (const v of values || []) if (Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; }
  return Number.isFinite(lo) ? [lo, hi] : null;
}
// -> { f, means: [lo, hi], source: [lo, hi] | null } for a block-averaged grid, else null
export function averagedInfo(grid, values) {
  if (!grid || !(grid.averagedBy > 1)) return null;
  const v = values || (typeof grid.values === "string" ? b64ToF32(grid.values) : grid.values);
  const src = Array.isArray(grid.sourceRange) && grid.sourceRange.every(Number.isFinite) ? grid.sourceRange : null;
  return { f: grid.averagedBy, means: meanRange(v), source: src };
}
// one sentence for the colour bar / stretch: the numbers are f x f means, and the source grid's own range when it was kept
export function averagedRangeText(info) {
  if (!info?.means) return "";
  return info.source
    ? tr("These are {f} × {f} block means, {lo} to {hi}; the source grid's own values run {a} to {b}.", { f: info.f, lo: fmt(info.means[0]), hi: fmt(info.means[1]), a: fmt(info.source[0]), b: fmt(info.source[1]) })
    : tr("These are {f} × {f} block means, {lo} to {hi}: the source grid's own extremes are beyond them.", { f: info.f, lo: fmt(info.means[0]), hi: fmt(info.means[1]) });
}
// typed contour levels that do not cross the kept grid, and why, for the contour message ('' when every level was drawn)
export function missedLevelsText(levels, drawn, info, values) {
  const got = new Set((drawn || []).map(Number)), missed = (levels || []).filter((l) => !got.has(Number(l)));
  if (!missed.length) return "";
  const r = info?.means || meanRange(values);
  const base = tr("No line at {levels}: the grid's values run {lo} to {hi}.", { levels: missed.join(", "), lo: fmt(r?.[0]), hi: fmt(r?.[1]) });
  if (!info) return base;
  return base + " " + (info.source
    ? tr("They are {f} × {f} block means; the source grid reaches {a} to {b}, so a level between is real in the file but not in the kept grid.", { f: info.f, a: fmt(info.source[0]), b: fmt(info.source[1]) })
    : tr("They are {f} × {f} block means: the source grid's peaks are higher and its lows lower.", { f: info.f }));
}
// the block's highest / lowest value at (col, row) of the kept grid, when kept: for an Identify line ('mean of 9 nodes; highest 417.5')
export function blockExtremesAt(grid, col, row) {
  if (!grid?.maxValues || !grid?.minValues) return null;
  const mx = typeof grid.maxValues === "string" ? b64ToF32(grid.maxValues) : grid.maxValues, mn = typeof grid.minValues === "string" ? b64ToF32(grid.minValues) : grid.minValues;
  const k = row * grid.nx + col;
  return Number.isFinite(mx[k]) ? { max: mx[k], min: mn[k], n: grid.averagedBy * grid.averagedBy } : null;
}
