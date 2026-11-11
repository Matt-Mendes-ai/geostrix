// TASKS.csv #2330 (review #2325, WA uranium) — a log table with a Superseded column imported whole: 22,407 lithology rows, 13,624 of them
// superseded re-logs drawn over the current log, 23,227 overlap warnings, no word. The import dialog gets an optional row filter ("only rows
// where <column> is <values>"), pre-filled when a flag column says which rows are out of date: Superseded / Obsolete / Deleted / Replaced
// TRUE (left out), or Current / Valid / Latest / Active FALSE (left out). Pure: no UI.

const norm = (v) => String(v ?? "").trim();
const TRUE = /^(true|t|yes|y|1|-1)$/i, FALSE = /^(false|f|no|n|0)$/i;
const DROP_WHEN_TRUE = /^(is_?)?(superseded|obsolete|deleted|replaced|void|voided|rejected)$/i;
const KEEP_WHEN_TRUE = /^(is_?)?(current|valid|latest|active|accepted)$/i;
const key = (h) => String(h ?? "").trim().replace(/[\s-]+/g, "_");

// the columns a row filter can use: 2..max distinct values over the rows -> [{ col, values: [[value, count]] }] (most common first)
export function rowFilterColumns(headers, rows, max = 12) {
  const out = [];
  for (const h of headers || []) {
    const counts = new Map();
    let over = false;
    for (const r of rows || []) { const v = norm(r?.[h]); if (!counts.has(v)) { if (counts.size >= max) { over = true; break; } counts.set(v, 0); } counts.set(v, counts.get(v) + 1); }
    if (over || counts.size < 2) continue;
    out.push({ col: h, values: [...counts].sort((a, b) => b[1] - a[1]) });
  }
  return out;
}

// the pre-set filter for a flag column, or null -> { col, keep: [values], drop: n, flag: "superseded" | "current" }
export function flagRowFilter(columns) {
  for (const c of columns || []) {
    const k = key(c.col), dropTrue = DROP_WHEN_TRUE.test(k), keepTrue = KEEP_WHEN_TRUE.test(k);
    if (!dropTrue && !keepTrue) continue;
    const vals = c.values.map(([v]) => v);
    if (!vals.every((v) => TRUE.test(v) || FALSE.test(v) || v === "")) continue; // not a yes / no flag
    const isOut = (v) => (dropTrue ? TRUE.test(v) : FALSE.test(v));
    const keep = vals.filter((v) => !isOut(v)), drop = c.values.filter(([v]) => isOut(v)).reduce((n, [, x]) => n + x, 0);
    if (!drop || !keep.length) continue;
    return { col: c.col, keep, drop, flag: dropTrue ? "superseded" : "current" };
  }
  return null;
}

// -> { rows, dropped } (no filter, or a column the rows lack: unchanged)
export function applyRowFilter(rows, filter) {
  if (!filter?.col || !Array.isArray(filter.keep)) return { rows, dropped: 0 };
  if (!(rows || []).some((r) => r && filter.col in r)) return { rows, dropped: 0 }; // `in`: the column reader's rows have getters, not own keys
  const keep = new Set(filter.keep.map(norm));
  const kept = (rows || []).filter((r) => keep.has(norm(r?.[filter.col])));
  return { rows: kept, dropped: (rows || []).length - kept.length };
}

// the filter an import gets when the user has not set one: the flag column's preset, or none (the dialog's box and the commit both ask this)
export const defaultRowFilter = (headers, rows) => flagRowFilter(rowFilterColumns(headers, rows));

// TASKS.csv #2391 (split from #2330, review #2325) — the intervals of an import that overlap another of the same hole, and the column that
// probably explains them: one of a few values (a flag, version or priority) that the overlapping rows carry far more often than the rest.
// cols: { hole, from, to } (the mapped columns). -> { n, holes, total, col, value, share } (col null when none stands out)
export function overlapSummary(rows, cols, headers) {
  const byHole = new Map();
  (rows || []).forEach((r, i) => {
    const h = norm(r?.[cols.hole]), f = Number(r?.[cols.from]), t = Number(r?.[cols.to]);
    if (!h || !Number.isFinite(f) || !Number.isFinite(t) || !(t > f)) return;
    (byHole.get(h) || byHole.set(h, []).get(h)).push({ i, f, t });
  });
  const over = new Set(), holes = new Set();
  let total = 0;
  for (const [h, list] of byHole) {
    total += list.length;
    list.sort((a, b) => a.f - b.f || a.t - b.t);
    let maxTo = -Infinity, at = -1;
    list.forEach((x, k) => { if (x.f < maxTo - 1e-6) { over.add(x.i); over.add(list[at].i); holes.add(h); } if (x.t > maxTo) { maxTo = x.t; at = k; } });
  }
  let best = null;
  if (over.size) {
    const skip = new Set([cols.hole, cols.from, cols.to]);
    for (const c of rowFilterColumns((headers || []).filter((h) => !skip.has(h)), rows)) {
      // a flag, version or priority column by its name, or a column of words (a lab, a status): never a grade with few values
      if (c.values.length > 6 || !(FLAGLIKE.test(key(c.col)) || c.values.some(([v]) => v !== "" && !Number.isFinite(Number(v))))) continue;
      const inOver = new Map();
      for (const i of over) { const v = norm(rows[i]?.[c.col]); inOver.set(v, (inOver.get(v) || 0) + 1); }
      for (const [v, n] of c.values) {
        const all = n / total, sh = (inOver.get(v) || 0) / over.size;
        if (all < 0.5 && sh >= 0.3 && sh > 1.5 * all && (!best || sh / all > best.lift)) best = { col: c.col, value: v, share: sh, lift: sh / all };
      }
    }
  }
  return { n: over.size, holes: holes.size, total, col: best?.col ?? null, value: best?.value ?? null, share: best?.share ?? null };
}
const FLAGLIKE = /(supersed|obsolete|delet|replac|void|reject|current|valid|latest|active|accept|version|^ver$|priority|prio|status|flag|rank|primary|rerun|order|seq)/i;
// whether an overlap count is worth a notice: more than a few rows and more than 2 % of them
export const overlapWorthSaying = (s) => s.n >= 5 && s.n > 0.02 * s.total;
