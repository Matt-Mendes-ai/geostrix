// TASKS.csv #2348 (review #2325, WA uranium) — Isocon averaged each element over whichever samples of a group carried it: on five method
// sets U was a mean of 1,181 rows, Al of 120 and Zr of 70 (all pXRF), three different sets of samples in one mass balance, and Ti (ticked
// immobile, no value in the precursor) left the table without a word. Pure helpers for the group means.

// the ticked immobile elements that have at least one value in BOTH groups (the others are named, not dropped in silence)
export function sharedImmobile(precRows, altRows, ticked, valueOf) {
  const has = (rows, s) => (rows || []).some((a) => valueOf(a, s) != null);
  const shared = [], missing = [];
  for (const s of ticked || []) {
    const p = has(precRows, s), q = has(altRows, s);
    if (p && q) shared.push(s); else missing.push({ symbol: s, group: !p && !q ? "both" : !p ? "precursor" : "altered" });
  }
  return { shared, missing };
}

// one group's means. require: the elements a sample must carry to be used (the shared immobile set), or [] for every sample.
// -> { n (samples in the group), used (samples used), values: { sym: mean | null }, ns: { sym: count } } | null
// #2505: isLt(a, sym) -> the value is below detection; lts: { sym: count } of those among ns
export function groupMeans(rows, symbols, valueOf, require = [], isLt = null) {
  if (!rows?.length) return null;
  const used = require.length ? rows.filter((a) => require.every((s) => valueOf(a, s) != null)) : rows;
  const values = {}, ns = {}, lts = {};
  for (const sym of symbols || []) {
    let sum = 0, k = 0;
    let lt = 0;
    for (const a of used) { const v = valueOf(a, sym); if (v != null) { sum += v; k++; if (isLt && isLt(a, sym)) lt++; } }
    values[sym] = k ? sum / k : null; ns[sym] = k; lts[sym] = lt;
  }
  return { n: rows.length, used: used.length, values, ns, lts };
}

export const MIN_GROUP_N = 3; // a mean of fewer samples is shown greyed, as unreliable
