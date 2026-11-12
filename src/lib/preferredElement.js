// TASKS.csv #1678 (review #1645, Copley) — Best intercepts, Grade stats and Compositing opened on Ag (the first element alphabetically) and
// Correlation pre-ticked the first 12 (Ag ... Co, no Cu or Mo) on a copper porphyry. They now open on the element last used in that
// tool on this computer (a convenience, localStorage), else the first commodity present; Correlation pre-ticks the commodity and
// alteration suite present, topped up in the file's order.
// TASKS.csv #2908 (WA iron review) — the bulk commodities too, after the metals (so a metal wins a tie): an iron-ore table (36 % mean Fe)
// opened every tool on Cu (mean 0.006 %), the only listed metal with any sample above its level
const COMMODITY = ["Cu", "Au", "Ag", "Zn", "Pb", "Mo", "Ni", "Co", "U", "Li", "Sn", "W"];
// the bulk ones only through leadCommodity (a grade above their level): as a plain fallback order Al would open every multi-element file
const LEAD_CANDIDATES = [...COMMODITY, "Fe", "Mn", "Al"];
// the commodities mined in bulk, where the major elements are the grade and the gangue: their correlation suite is the majors
export const BULK_COMMODITIES = new Set(["Fe", "Mn", "Al"]);
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
// #2908 — the bulk levels are ore grades, set high so a host rock does not read as the commodity: Fe 50 % (direct-shipping iron ore; banded
// iron formation itself runs about 25-35 %, so a BIF-hosted gold project keeps Au), Mn 25 %, Al 21 % (about 40 % Al2O3, bauxite; an
// ordinary rock holds 13-18 % Al2O3). In ppm of the element, as valueOf gives it (an oxide kept as the oxide is read as its element).
export const MINERALIZED_PPM = { Cu: 1000, Au: 0.1, Ag: 5, Zn: 1000, Pb: 1000, Mo: 100, Ni: 1000, Co: 500, U: 50, Li: 500, Sn: 500, W: 500, Fe: 500000, Mn: 250000, Al: 212000 };
export function leadCommodity(samples, valueOf) {
  let best = null, bestShare = 0;
  for (const sym of LEAD_CANDIDATES) {
    let n = 0, hi = 0;
    for (const s of samples || []) { if (s?.values?.[sym] == null) continue; const v = valueOf(s, sym); if (v == null || !Number.isFinite(v)) continue; n++; if (v >= MINERALIZED_PPM[sym]) hi++; }
    const share = n ? hi / n : 0;
    if (share > bestShare) { best = sym; bestShare = share; }
  }
  return best;
}
// the first n symbols to tick in a correlation matrix. TASKS.csv #2351 (review #2325, WA uranium) — the fixed sulphide suite (Cu-Mo-Ag-S ...)
// was ticked on a uranium project and U was not: with { lead, counts } the project's lead commodity comes first, then the elements with
// the most values (at least MIN_PAIRS: Bi on 46 core samples, all below detection, was a row of dashes), the suite only breaking ties.
export const MIN_PAIRS = 10;

// TASKS.csv #2741 (split from #2512) — the X-Y scatter's default Y: the element whose values follow the lead's most closely in these
// samples (Pearson on log10 values, |r|, over the samples with both above zero and at least MIN_PAIRS of them), not the next of a fixed
// suite. With no such element: the one with the most values. symbols: the candidates (assayed elements, the lead excluded by the caller
// or here; calculated ones should be left out, a CuEq follows its Cu by construction). -> a symbol, or null
export function bestPartner(rows, lead, symbols) {
  const cands = (symbols || []).filter((s) => s && s !== lead);
  if (!cands.length) return null;
  const pos = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.log10(n) : null; };
  const leadLogs = lead ? (rows || []).map((r) => pos(r?.values?.[lead])) : null;
  let best = null, bestR = -1, most = null, mostN = -1;
  for (const s of cands) {
    let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, have = 0;
    (rows || []).forEach((r, i) => {
      const y = pos(r?.values?.[s]);
      if (y == null) return;
      have++;
      const x = leadLogs ? leadLogs[i] : null;
      if (x == null) return;
      n++; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
    });
    if (have > mostN) { mostN = have; most = s; }
    if (n < MIN_PAIRS) continue;
    const vx = sxx - (sx * sx) / n, vy = syy - (sy * sy) / n;
    if (!(vx > 0 && vy > 0)) continue;
    const r = Math.abs((sxy - (sx * sy) / n) / Math.sqrt(vx * vy));
    if (r > bestR) { bestR = r; best = s; }
  }
  return best || (mostN > 0 ? most : null);
}
// #2908 — medians ({ symbol: median grade in ppm }, given for a bulk commodity's project): ties in the count are broken by the higher median
// (the majors: SiO2, Al2O3, LOI, Mn, P beside Fe), not by the sulphide suite
export function correlationDefaults(symbols, n = 12, { lead = null, counts = null, medians = null } = {}) {
  const list = (symbols || []).filter(Boolean);
  if (!counts) {
    const out = [...(lead && list.includes(lead) ? [lead] : []), ...SUITE.filter((s) => list.includes(s) && s !== lead)];
    for (const s of list) { if (out.length >= n) break; if (!out.includes(s)) out.push(s); }
    return out.slice(0, n);
  }
  const out = lead && list.includes(lead) ? [lead] : [];
  const rank = (s) => { const i = SUITE.indexOf(s); return i < 0 ? SUITE.length + list.indexOf(s) : i; };
  const med = (s) => (medians && Number.isFinite(medians[s]) ? medians[s] : -Infinity);
  const rest = list.filter((s) => !out.includes(s) && (counts[s] || 0) >= MIN_PAIRS).sort((a, b) => (counts[b] || 0) - (counts[a] || 0) || (medians ? med(b) - med(a) : 0) || rank(a) - rank(b));
  return [...out, ...rest].slice(0, n);
}
