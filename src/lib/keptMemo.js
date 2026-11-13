// TASKS.csv #3120 (#2910's remaining stalls, WA iron review) — the Geochem tab re-derived everything on every visit (the samples shown, the QC
// split, the lead's partner, the hole colours, each sample's lithology, the X-Y statistics and fit): 2.2 s of a re-entry on 147,000 samples,
// because a tab switch unmounts the module and its useMemo results go with it. keptMemo keeps a result across mounts while the arrays it was
// computed from are the same objects (the store's own, or a result kept here) and the settings string is the same.
// roots: the objects the result depends on (null / undefined allowed), at least one; key: a string of everything else it depends on.
// At most PER_ROOT results per root chain (the oldest dropped), so a session of many settings does not grow without bound.
const PER_ROOT = 24;
const tops = new Map(); // number of roots -> WeakMap chain (chains of different lengths never share a level)
const NONE = {}; // stands for a null / undefined / primitive root
export function keptMemo(roots, key, compute) {
  if (!roots || !roots.length) return compute();
  let m = tops.get(roots.length);
  if (!m) tops.set(roots.length, (m = new WeakMap()));
  for (let i = 0; i < roots.length; i++) {
    const r = roots[i] != null && (typeof roots[i] === "object" || typeof roots[i] === "function") ? roots[i] : NONE;
    let next = m.get(r);
    if (!next) m.set(r, (next = i === roots.length - 1 ? new Map() : new WeakMap()));
    m = next;
  }
  if (m.has(key)) return m.get(key);
  const v = compute();
  m.set(key, v);
  if (m.size > PER_ROOT) m.delete(m.keys().next().value);
  return v;
}
