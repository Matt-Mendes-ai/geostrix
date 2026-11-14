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

// TASKS.csv #3387 (split from #3170) — each hole's rows by logged value: positions into that hole's rowsByHole list, ascending. A stack's
// units each walked every row of every hole (150,455 x 6 on WA iron, about 0.35 s of the run's first task) to keep the few of its own
// code; with this a unit reads only its codes' rows. Kept per rows array, like rowsByHole. Pure.
const byValueCache = new WeakMap();
export function rowsByHoleValue(rows) {
  if (!rows) return new Map();
  let m = byValueCache.get(rows);
  if (!m) {
    m = new Map();
    for (const [h, list] of rowsByHole(rows)) {
      const byV = new Map();
      for (let i = 0; i < list.length; i++) { const v = list[i].value, a = byV.get(v); if (a) a.push(i); else byV.set(v, [i]); }
      m.set(h, byV);
    }
    byValueCache.set(rows, m);
  }
  return m;
}
// a hole's rows whose value is one of `codes`, in the hole's own row order
export function holeRowsOfCodes(rows, hole, codes) {
  const list = rowsByHole(rows).get(hole), byV = rowsByHoleValue(rows).get(hole);
  if (!list || !byV) return [];
  const pos = [];
  for (const c of codes) { const a = byV.get(c); if (a) for (const i of a) pos.push(i); }
  if (codes.size > 1) pos.sort((a, b) => a - b);
  return pos.map((i) => list[i]);
}
// #3387 — each hole's shallowest logged FROM, kept per rows array (every unit of a stack built it again over all the rows)
const firstFromCache = new WeakMap();
export function firstFromByHole(rows) {
  if (!rows) return new Map();
  let m = firstFromCache.get(rows);
  if (!m) {
    m = new Map();
    for (const r of rows) { if (!r) continue; const f = Number(r.from); if (r.hole_id != null && Number.isFinite(f) && !(m.get(r.hole_id) <= f)) m.set(r.hole_id, f); }
    firstFromCache.set(rows, m);
  }
  return m;
}
