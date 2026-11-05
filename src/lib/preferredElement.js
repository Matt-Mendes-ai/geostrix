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
// symbols: the tool's element list (strings) -> the one to open on
export function preferredElement(symbols, tool = null) {
  const list = (symbols || []).filter(Boolean);
  if (!list.length) return "";
  if (tool) { try { const last = localStorage.getItem(key(tool)); if (last && list.includes(last)) return last; } catch { /* no storage */ } }
  return COMMODITY.find((s) => list.includes(s)) || list[0];
}
// the first n symbols to tick in a correlation matrix
export function correlationDefaults(symbols, n = 12) {
  const list = (symbols || []).filter(Boolean), out = SUITE.filter((s) => list.includes(s));
  for (const s of list) { if (out.length >= n) break; if (!out.includes(s)) out.push(s); }
  return out.slice(0, n);
}
