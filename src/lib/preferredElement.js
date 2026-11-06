// TASKS.csv #1678 (review #1645, Copley) — Best intercepts, Grade stats and Compositing opened on Ag (the first element alphabetically) and
// Correlation pre-ticked the first 12 (Ag ... Co, no Cu or Mo) on a copper porphyry. They now open on the element last used in that
// tool on this computer (a convenience, localStorage), else the first commodity present; Correlation pre-ticks the commodity and
// alteration suite present, topped up in the file's order.
const COMMODITY = ["Cu", "Au", "Ag", "Zn", "Pb", "Mo", "Ni", "Co", "U", "Li", "Sn", "W"];
const SUITE = ["Cu", "Au", "Mo", "Ag", "S", "Fe", "K", "Na", "As", "Bi", "Te", "Zn"];
const key = (tool) => `geostrix.lastElement.${tool}`;

export function rememberElement(tool, symbol) {
  try { if (symbol) localStorage.setItem(key(tool), String(symbol)); } catch { /* storage off: nothing to remember */ }
}
// symbols: the tool's element list (strings) -> the one to open on. lead (optional, #1523): the project's lead commodity
// (leadCommodity), taken before the fixed order when the list has it
export function preferredElement(symbols, tool = null, lead = null) {
  const list = (symbols || []).filter(Boolean);
  if (!list.length) return "";
  if (tool) { try { const last = localStorage.getItem(key(tool)); if (last && list.includes(last)) return last; } catch { /* no storage */ } }
  if (lead && list.includes(lead)) return lead;
  return COMMODITY.find((s) => list.includes(s)) || list[0];
}

// TASKS.csv #1523 (Matt, 2026-11-06: on an Au-Ag project the surface tools should open on Au, not Cu) — the project's lead commodity
// from its own analyses: for each commodity, the share of the samples that have it at or above a grade typical of mineralization
// (MINERALIZED_PPM); the largest share wins, the fixed order breaking ties. Only a default: the user picks any element.
// samples: rows with `values`; valueOf(sample, symbol) -> ppm or null. -> a symbol, or null when nothing reaches its level
export const MINERALIZED_PPM = { Cu: 1000, Au: 0.1, Ag: 5, Zn: 1000, Pb: 1000, Mo: 100, Ni: 1000, Co: 500, U: 50, Li: 500, Sn: 500, W: 500 };
export function leadCommodity(samples, valueOf) {
  let best = null, bestShare = 0;
  for (const sym of COMMODITY) {
    let n = 0, hi = 0;
    for (const s of samples || []) { if (s?.values?.[sym] == null) continue; const v = valueOf(s, sym); if (v == null || !Number.isFinite(v)) continue; n++; if (v >= MINERALIZED_PPM[sym]) hi++; }
    const share = n ? hi / n : 0;
    if (share > bestShare) { best = sym; bestShare = share; }
  }
  return best;
}
// the first n symbols to tick in a correlation matrix
export function correlationDefaults(symbols, n = 12) {
  const list = (symbols || []).filter(Boolean), out = SUITE.filter((s) => list.includes(s));
  for (const s of list) { if (out.length >= n) break; if (!out.includes(s)) out.push(s); }
  return out.slice(0, n);
}
