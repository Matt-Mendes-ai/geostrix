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

// TASKS.csv #1114 — one interpolating quantile and one median. Three identical linear-interpolation quantiles had grown
// up beside percentile() (thresholds.js, ensembleProbability.js, evidence.js) and seven medians, two of which took the
// upper-middle value of an even count (stackOrder.js, voxelSample.js). Hyndman & Fan type 7 (the spreadsheet / R
// default); p in 0..1. quantileSorted() takes an ascending array; the others keep the finite values of a copy.
export function quantileSorted(s, p) {
  if (!s.length) return NaN;
  const h = (s.length - 1) * p, lo = Math.floor(h), hi = Math.ceil(h);
  return s[lo] + (h - lo) * (s[hi] - s[lo]);
}
// TASKS.csv #2798 follow-up — a Float64Array's own numeric sort (no comparator call per pair): the same ascending order, a fraction of the time
const finiteSorted = (values) => {
  const s = new Float64Array(values.length);
  let n = 0;
  for (let i = 0; i < values.length; i++) if (Number.isFinite(values[i])) s[n++] = +values[i];
  return s.subarray(0, n).sort();
};
export const quantileLinear = (values, p) => quantileSorted(finiteSorted(values), p);

// TASKS.csv #2910 (review #2876, WA iron) — values with their weights in ascending value order, as two Float64Arrays: Grade stats sorted the
// same 147,000 values five times per choice (three percentiles, the probability points, the break's summary), each an array of pairs with a
// comparator (1.4 s for the three percentiles alone). The values are sorted natively; each weight is put into its value's block by binary
// search in the original order, which is exactly a stable sort by value (equal values keep their input order).
// values / weights: arrays (weights null = 1 each). Kept: a finite value whose weight is finite and > 0 (keepZero: >= 0). coerce: read each
// value and weight through Number() first (probPlot's old rule: null counts as 0, '2' as 2); otherwise only numbers are kept.
// -> { v, w, n, total }. Cached per (values, weights) pair while both arrays live and are not changed (callers pass fresh arrays).
const sortedCache = new WeakMap();
export function sortedWeighted(values, weights = null, { keepZero = false, coerce = false } = {}) {
  const vals = values || [];
  const opt = (keepZero ? 1 : 0) + (coerce ? 2 : 0);
  let byW = sortedCache.get(vals);
  const key = weights || sortedCache;
  // a result made with other options is the same one when nothing they treat differently was seen: no value or weight that is not a
  // number (coerce then changes nothing) and no weight of 0 (keepZero then changes nothing)
  const slots = byW?.get(key);
  if (slots) {
    if (slots[opt]) return slots[opt];
    for (const h of slots) if (h && (h.coerce === coerce || !h.nonNumber) && (h.keepZero === keepZero || !h.zeroW)) return h;
  }
  const m = vals.length, idx = new Uint32Array(m), x = new Float64Array(m), wx = new Float64Array(m);
  let n = 0, nonNumber = false, zeroW = false;
  for (let i = 0; i < m; i++) {
    const raw = vals[i], rawW = weights ? weights[i] : 1;
    if (typeof raw !== "number" || typeof rawW !== "number") nonNumber = true;
    const a = coerce ? Number(raw) : raw, wt = coerce ? Number(rawW) : rawW;
    if (wt === 0) zeroW = true;
    if (typeof a !== "number" || !Number.isFinite(a) || typeof wt !== "number" || !Number.isFinite(wt) || !(keepZero ? wt >= 0 : wt > 0)) continue;
    idx[n] = i; x[n] = a; wx[n] = wt; n++;
  }
  const v = x.slice(0, n).sort(), w = new Float64Array(n), used = new Uint32Array(n);
  let total = 0;
  for (let k = 0; k < n; k++) {
    const a = x[k];
    let lo = 0, hi = n;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (v[mid] < a) lo = mid + 1; else hi = mid; }
    w[lo + used[lo]++] = wx[k]; total += wx[k];
  }
  const out = { v, w, n, total, coerce, keepZero, nonNumber, zeroW };
  if (vals && typeof vals === "object") { if (!byW) sortedCache.set(vals, (byW = new Map())); const slot = byW.get(key) || []; slot[opt] = out; byW.set(key, slot); }
  return out;
}
export const median = (values) => quantileSorted(finiteSorted(values), 0.5); // the mean of the two middle values for an even count; NaN when empty
