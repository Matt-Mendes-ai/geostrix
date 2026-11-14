// TASKS.csv #3142 — the 2-98 % stretch of a big grid without sorting every value. A 2000 x 2000 grid's import sorted all 4 million values (1.3 s
// on the UI thread) to read two of them. Its own module, loaded only with the grid readers (rasterRows.js) and the grid picture
// (gridPicture.js): idw.js makeStretch and arrayStats.js are in the startup bundle (TASKS.csv #3159) and keep their sort.

// percentileSorted's values (arrayStats.js, #740: the value at rank round(p * (n - 1)) of the ascending list) at several p of an UNSORTED
// Float64Array of finite numbers, by selection (quickselect, median-of-three pivots): the same numbers, -0 / +0 included, in O(n). The array is
// reordered in place. A run of bad pivots (more than 4 log2 n partitions) sorts what is left instead, so the worst case stays a sort.
// -> one value per p, in the order given
export function percentilesBySelection(a, ps) {
  const n = a.length;
  if (!n) return ps.map(() => NaN);
  const ranks = ps.map((p) => Math.min(n - 1, Math.max(0, Math.round(p * (n - 1)))));
  const order = ranks.map((k, i) => [k, i]).sort((x, y) => x[0] - y[0]);
  const out = new Array(ps.length);
  let left = 0;
  const limit = 4 * Math.ceil(Math.log2(n + 1)) + 8;
  for (const [k, i] of order) {
    let lo = left, hi = n - 1, rounds = 0;
    while (hi > lo) {
      if (++rounds > limit) { a.subarray(lo, hi + 1).sort(); break; }
      const mid = (lo + hi) >>> 1;
      // median of three to the middle, then a Hoare-style partition around it
      if (a[mid] < a[lo]) { const t = a[mid]; a[mid] = a[lo]; a[lo] = t; }
      if (a[hi] < a[lo]) { const t = a[hi]; a[hi] = a[lo]; a[lo] = t; }
      if (a[hi] < a[mid]) { const t = a[hi]; a[hi] = a[mid]; a[mid] = t; }
      const pivot = a[mid];
      let x = lo, y = hi;
      while (x <= y) {
        while (a[x] < pivot) x++;
        while (a[y] > pivot) y--;
        if (x <= y) { const t = a[x]; a[x] = a[y]; a[y] = t; x++; y--; }
      }
      if (k <= y) hi = y; else if (k >= x) lo = x; else break; // between y and x: every value there equals the pivot
    }
    let v = a[k];
    // the sort puts -0 before +0: at a zero, the rank falls among the -0s when more than k values are negative or -0
    if (v === 0) { let below = 0; for (let j = 0; j < n; j++) if (a[j] < 0 || Object.is(a[j], -0)) below++; v = k < below ? -0 : 0; }
    out[i] = v;
    left = k; // the next (larger) rank lies at or right of this one: everything left of k is no larger
  }
  return out;
}

// idw.js makeStretch(values, "p2-98")'s result for a Float64Array of FINITE values, by selection: { mode, lo, hi, t }. The array is reordered.
export function stretchP298(finite) {
  if (!finite.length) return { t: () => 0, lo: null, hi: null, mode: "p2-98" };
  const [lo, hi] = percentilesBySelection(finite, [0.02, 0.98]);
  return { mode: "p2-98", lo, hi, t: (x) => (hi > lo ? Math.min(1, Math.max(0, (x - lo) / (hi - lo))) : 0) };
}
