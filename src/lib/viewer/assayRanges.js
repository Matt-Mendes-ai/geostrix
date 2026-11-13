// TASKS.csv #3055 (the rest of #2932, WA iron) — an element's marker-size range (min, max, p50, p90 and the count of finite values, #306 /
// #2932) over the shown source's samples. buildAssaySpheres worked it out for every shown element on every build, a filter and a comparator
// sort of all 148,000 samples each: about 0.66 s of each element switch on WA iron. It is kept per samples array (the store replaces the
// array on any change) and per source and element, and sorted as a typed array. Same answers as before (test/assayRanges3055).
const cache = new WeakMap();

// assays: the rows ({ values }); sym: the element; source: the assaySource key ("lab" | "pxrf" | "both"); shown(row) -> the row counts
export function assayRange(assays, sym, source, shown) {
  if (!Array.isArray(assays)) return { min: 0, max: 0, p50: undefined, p90: undefined, n: 0 };
  let per = cache.get(assays);
  if (!per) cache.set(assays, (per = new Map()));
  const key = `${source}|${sym}`;
  const hit = per.get(key);
  if (hit) return hit;
  let n = 0;
  const buf = new Float64Array(assays.length);
  for (const a of assays) { const v = a?.values?.[sym]; if (v == null || !shown(a) || !Number.isFinite(v)) continue; buf[n++] = v; }
  const finite = buf.subarray(0, n).sort();
  const q = (pp) => (n ? finite[Math.min(n - 1, Math.floor(pp * (n - 1)))] : undefined);
  const r = n ? { min: finite[0], max: finite[n - 1], p50: q(0.5), p90: q(0.9), n } : { min: 0, max: 0, p50: undefined, p90: undefined, n: 0 };
  per.set(key, r);
  return r;
}
