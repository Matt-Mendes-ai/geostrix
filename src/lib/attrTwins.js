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
