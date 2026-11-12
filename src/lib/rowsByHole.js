// TASKS.csv #2906 (WA iron review) — an interval log's rows grouped by hole, built once per array (the store's arrays are replaced, never
// mutated in place) and kept while that array lives. The implicit run's contact gatherer filtered the whole 150,455-row Lithology array once
// per hole per unit (6,390 holes): seconds of frozen window before every run. Rows keep their order within a hole. Pure.
const cache = new WeakMap();

export function rowsByHole(rows) {
  if (!rows) return new Map();
  let m = cache.get(rows);
  if (!m) {
    m = new Map();
    for (const r of rows) { if (!r) continue; const a = m.get(r.hole_id); if (a) a.push(r); else m.set(r.hole_id, [r]); }
    cache.set(rows, m);
  }
  return m;
}
