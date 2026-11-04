// TASKS.csv #1583 (review #1497, Lawyers) — cleaning rover readings on import. A GEM GSM-19 walking-mag file carries a signal
// quality column (sq, 0-99) beside every reading, and the base-station reader already drops readings under 50 (lib/diurnal.js);
// the rover readings had no such test, so dropouts of 2,105-23,635 nT and spikes to 167,300 nT went in and drove the grid,
// the inversion's floor hint and its best-fit plane. Pure: no React.
import { median } from "./arrayStats.js"; // TASKS.csv #1114

// the column that holds a signal quality, by name: sq / quality / qc / sig / signal
export function guessQualityColumn(columns) {
  const names = ["sq", "quality", "qc", "sig", "signal", "sigq", "squality"];
  const low = (columns || []).map((c) => String(c).toLowerCase().trim());
  let i = low.findIndex((c) => names.includes(c));
  if (i < 0) i = low.findIndex((c) => /^(sq|qual|qc|sig)/.test(c) && !/^sigma/.test(c));
  return i >= 0 ? columns[i] : "";
}

// rows: the parsed rows (objects keyed by column); a reading whose quality is a number below `min` is dropped (a non-numeric
// quality, as "*" no-data, keeps the reading: there is nothing to judge it by). -> { rows, dropped }
export function filterSignalQuality(rows, qualityCol, min = 50) {
  if (!qualityCol || !(min > 0)) return { rows, dropped: 0 };
  let dropped = 0;
  const kept = rows.filter((r) => { const q = Number(r[qualityCol]); if (Number.isFinite(q) && q < min) { dropped++; return false; } return true; });
  return { rows: kept, dropped };
}

// A despike along the lines, in file order: each reading is compared with the median of the `window` readings around it on the
// same line (its own value included), and dropped when it is more than `k` times the line's MAD (median absolute deviation
// from the running median, scaled 1.4826) away, and at least `minStep` away (a quiet line's MAD can be a fraction of a nT).
// Readings are grouped by `lineOf(row)` (null: one line). -> { rows, dropped, threshold: { line: nT } }
export function despikeAlongLines(rows, valueOf, lineOf = () => null, { window = 11, k = 6, minStep = 20 } = {}) {
  const groups = new Map();
  rows.forEach((r, i) => { const l = lineOf(r) ?? "\u0000"; if (!groups.has(l)) groups.set(l, []); groups.get(l).push(i); });
  const drop = new Set(), threshold = {};
  const half = Math.max(1, Math.floor(window / 2));
  for (const [line, idx] of groups) {
    const vals = idx.map((i) => valueOf(rows[i])), n = vals.length;
    // the window is always centred: past either end the line is reflected through its end value (a point reflection keeps a
    // sloping field linear), so the first and last readings of a line on a gradient are not read as spikes
    const at = (j) => (j < 0 ? 2 * vals[0] - vals[Math.min(n - 1, -j)] : j >= n ? 2 * vals[n - 1] - vals[Math.max(0, 2 * (n - 1) - j)] : vals[j]);
    const run = vals.map((_, j) => { const w = []; for (let k = j - half; k <= j + half; k++) { const v = at(k); if (Number.isFinite(v)) w.push(v); } return median(w); });
    const dev = vals.map((v, j) => (Number.isFinite(v) && Number.isFinite(run[j]) ? Math.abs(v - run[j]) : NaN)).filter(Number.isFinite);
    const mad = 1.4826 * median(dev);
    const limit = Math.max(minStep, k * (Number.isFinite(mad) ? mad : 0));
    threshold[line === "\u0000" ? "" : line] = limit;
    vals.forEach((v, j) => { if (Number.isFinite(v) && Number.isFinite(run[j]) && Math.abs(v - run[j]) > limit) drop.add(idx[j]); });
  }
  return { rows: rows.filter((_, i) => !drop.has(i)), dropped: drop.size, threshold };
}

// The largest anomaly about the median among the readings that are not outliers (within `k` MADs): a dropout or a spike
// is not "the largest anomaly" an inversion's noise floor should be 2 % of. -> nT (or null)
export function robustAnomalyMax(values, k = 10) {
  const v = (values || []).filter(Number.isFinite);
  if (!v.length) return null;
  const med = median(v), mad = 1.4826 * median(v.map((x) => Math.abs(x - med)));
  const limit = mad > 0 ? k * mad : Infinity;
  let m = 0;
  for (const x of v) { const a = Math.abs(x - med); if (a <= limit) m = Math.max(m, a); }
  return m > 0 ? m : null;
}
