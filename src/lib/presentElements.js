// TASKS.csv #1679 (review #1645, Copley) — the project's element list, as the data has it: an element with no value in any assay row is left
// out (Copley's 4-acid package left B, Cs, Dy ... Yb blank on all 1,539 rows; they were listed in every dropdown, Correlation drew a row of
// dashes for them, and TAS said '0 of 2095 plotted' instead of 'missing Si'). The stored list depended on the import / remove history; this
// does not. The same array is returned when nothing is left out.
export function elementsWithValues(elements, rows) {
  if (!elements?.length) return elements;
  const want = new Set(elements.map((e) => e.symbol)), seen = new Set();
  for (const r of rows || []) {
    const v = r?.values;
    if (!v) continue;
    for (const k in v) if (want.has(k) && !seen.has(k) && Number.isFinite(v[k])) seen.add(k);
    if (seen.size === want.size) return elements;
  }
  return elements.filter((e) => seen.has(e.symbol));
}
