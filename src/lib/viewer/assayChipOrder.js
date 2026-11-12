// TASKS.csv #2374 (review #2325, WA uranium) — the 3D View's assay chips were in import order: U, the commodity with the most values
// (9,733), was the eighth of 63 chips because the assays came in six passes, fewest values first. Chips now come: the shown elements
// first (in the order they were switched on), then by how many rows carry a value (most first), ties alphabetical. Pure.

// rows: store.assays ([{ values: { sym: number } }]) -> Map(symbol -> rows with a finite value)
export function assayValueCounts(rows) {
  const n = new Map();
  for (const r of rows || []) {
    const v = r?.values;
    if (!v) continue;
    for (const k in v) if (Number.isFinite(v[k])) n.set(k, (n.get(k) || 0) + 1);
  }
  return n;
}

// elements: [{ symbol, ... }]; shown: the displayed symbols in order; counts: assayValueCounts -> the elements in chip order
export function orderAssayChips(elements, shown, counts) {
  const at = new Map((shown || []).map((s, i) => [s, i]));
  return [...(elements || [])].sort((a, b) => {
    const sa = at.has(a.symbol), sb = at.has(b.symbol);
    if (sa !== sb) return sa ? -1 : 1;
    if (sa) return at.get(a.symbol) - at.get(b.symbol);
    return (counts?.get(b.symbol) || 0) - (counts?.get(a.symbol) || 0) || String(a.symbol).localeCompare(String(b.symbol));
  });
}

// TASKS.csv #2785 — a filter box over the chips once a project has more than CHIP_FILTER_MIN elements (WA uranium: 63). A chip stays when
// its symbol contains the typed text (any case) or it is shown, so a shown element can always be switched off. Empty text: every chip.
export const CHIP_FILTER_MIN = 20;
export function filterAssayChips(chips, text, shown) {
  const q = String(text || "").trim().toLowerCase();
  if (!q) return chips;
  const on = new Set(shown || []);
  return (chips || []).filter((e) => on.has(e.symbol) || String(e.symbol).toLowerCase().includes(q));
}
