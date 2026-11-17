// TASKS.csv #3733 (Scottie Gold import review) — the collar `zone` values 'D zone' and 'D Zone' (and 'Gully' beside 'Gully Zone') stayed apart with no hint: two classes in the hole
// filter, the hole colours and Grade statistics. After a collar import the attribute values that are one value spelled two ways are named, so a person can fix the file.
// Twins: equal after folding case, spaces and punctuation, or equal once a trailing generic word ('zone', 'area', 'target', 'prospect', 'trend') is dropped.
const TRAIL = /\s+(zone|area|target|prospect|trend|deposit|vein|corridor)$/i;
const fold = (v) => String(v).toLowerCase().replace(/[\s_\-.]+/g, " ").trim();
const stem = (v) => fold(v).replace(TRAIL, "");

// rows: [{ [col]: value }]; cols: the attribute columns kept -> [{ col, values: [{ value, n }] }] (the values of each twin group, the biggest first)
export function attrTwinGroups(rows, cols, { maxDistinct = 100 } = {}) {
  const out = [];
  for (const col of cols || []) {
    const count = new Map();
    for (const r of rows || []) { const v = String(r?.[col] ?? "").trim(); if (v) count.set(v, (count.get(v) || 0) + 1); }
    if (count.size < 2 || count.size > maxDistinct) continue;
    const by = new Map();
    for (const [v, n] of count) { if (/^-?\d+(\.\d+)?$/.test(v)) continue; const k = stem(v); if (!by.has(k)) by.set(k, []); by.get(k).push({ value: v, n }); }
    for (const g of by.values()) if (g.length > 1) out.push({ col, values: g.sort((a, b) => b.n - a.n || (a.value < b.value ? -1 : 1)) });
  }
  return out;
}

// TASKS.csv #3742 (follow-up of #3733) — the one-click merge. The twin groups of a project's collars (its attribute values, as the import notice names them) and the collars with
// each group's values made one: the commonest spelling wins (a tie: the first alphabetically). The collars' other fields are untouched; holes with no value stay without one.
// -> [{ col, values: [{ value, n }] }] for the collars' attributes
export function collarTwinGroups(collars, { maxDistinct = 100 } = {}) {
  const cols = new Set();
  for (const c of collars || []) if (c?.attrs && typeof c.attrs === "object") for (const k in c.attrs) if (!k.startsWith("_")) cols.add(k);
  return attrTwinGroups((collars || []).map((c) => c.attrs || {}), [...cols], { maxDistinct });
}
// -> { collars, changed: number of holes whose value changed, groups }; the same array back when there is nothing to merge
export function mergeCollarTwins(collars, groups = null) {
  const gs = groups || collarTwinGroups(collars);
  if (!gs.length) return { collars, changed: 0, groups: [] };
  const to = new Map(); // col -> Map(value -> canonical)
  for (const g of gs) { const m = to.get(g.col) || to.set(g.col, new Map()).get(g.col); for (const v of g.values) m.set(v.value, g.values[0].value); }
  let changed = 0;
  const next = collars.map((c) => {
    const at = c?.attrs; if (!at) return c;
    let out = null;
    for (const [col, m] of to) { const v = String(at[col] ?? "").trim(); const w = m.get(v); if (w != null && w !== at[col]) { out = out || { ...at }; out[col] = w; } }
    if (!out) return c; changed++; return { ...c, attrs: out };
  });
  return { collars: changed ? next : collars, changed, groups: gs };
}
// one group as text: "'D Zone' (12) and 'D zone' (3)"
export const twinGroupText = (g) => g.values.map((v) => `'${v.value}' (${v.n})`).join(", ");

