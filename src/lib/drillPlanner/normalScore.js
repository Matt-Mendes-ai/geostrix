// TASKS.csv #3962 (P1) — the normal-score transform (Gaussian anamorphosis) the drill planner's grade model works in. Grades are
// skewed; the Gaussian model is built on their normal scores and each realization is turned back into grades value by value, never by
// back-transforming a mean (design.md section 1.1). Ties share one score (the mean of their ranks). The back-transform interpolates
// between the data's own scores and stops at the lowest and highest composite: the model never invents a grade above the highest
// one drilled (a conservative tail, said on the panel).
import { normInv } from "./gaussian.js";

// values: the composites' grades -> { forward(v), back(y), n, min, max, table: { v: Float64Array, y: Float64Array } } | null
export function fitNormalScore(values) {
  const v = (values || []).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  const n = v.length;
  if (n < 2) return null;
  // one node per distinct value, at the mean plotting position of its ties: p = (rank - 0.5) / n
  const tv = [], ty = [];
  for (let i = 0; i < n;) {
    let j = i; while (j + 1 < n && v[j + 1] === v[i]) j++;
    const p = ((i + j) / 2 + 0.5) / n;
    tv.push(v[i]); ty.push(normInv(p));
    i = j + 1;
  }
  const table = { v: Float64Array.from(tv), y: Float64Array.from(ty) };
  return { n, min: v[0], max: v[n - 1], table, forward: (x) => interp(table.v, table.y, x), back: (y) => interp(table.y, table.v, y) };
}

// piecewise-linear lookup from sorted xs to ys, held flat past either end
function interp(xs, ys, x) {
  const m = xs.length;
  if (m === 1 || x <= xs[0]) return ys[0];
  if (x >= xs[m - 1]) return ys[m - 1];
  let lo = 0, hi = m - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (xs[mid] <= x) lo = mid; else hi = mid; }
  const t = (x - xs[lo]) / (xs[hi] - xs[lo] || 1);
  return ys[lo] + t * (ys[hi] - ys[lo]);
}

// the back-transform from a plain table (as it crosses into the worker)
export function backFromTable(table) { return (y) => interp(table.y, table.v, y); }
export function forwardFromTable(table) { return (x) => interp(table.v, table.y, x); }
