// TASKS.csv #2032 (review #2013, Woodjam) — surface-sample element lists followed the file's column order: V came first in Thresholds, Plan
// map, Level surveys, Domains and Surface QAQC, and Plan map opened on 'V — No threshold saved for V'. A new import's elements are kept
// in this order instead: the data's lead commodity first (useLeadCommodity's leadCommodity, from the values, not a deposit type), then the
// usual commodity metals, then the rest alphabetically. Elements already in the project keep their place.
const COMMODITY_FIRST = ["Au", "Ag", "Cu", "Zn", "Pb", "Mo", "Ni", "Co", "U", "Li", "Sn", "W", "Pt", "Pd"];
export function orderElements(elements, lead = null, symbolOf = (e) => e.symbol) {
  const rank = (e) => { const s = symbolOf(e); if (lead && s === lead) return -1; const i = COMMODITY_FIRST.indexOf(s); return i < 0 ? COMMODITY_FIRST.length : i; };
  return [...(elements || [])].sort((a, b) => rank(a) - rank(b) || String(symbolOf(a)).localeCompare(String(symbolOf(b))));
}
