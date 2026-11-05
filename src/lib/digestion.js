// TASKS.csv #1518 (review #1497, Lawyers) — which digestion each element was measured by, and the warning the immobile-element tools owe.
// Every Lawyers drill assay was ME-MS61 (four-acid): zircon does not fully dissolve, so Zr and Hf (and partly Nb, Ta and the REE) read
// low and the Zr/TiO2-based fields shift, while the Winchester caption said 'Robust to alteration'. The import dropped the
// *_analysis_code columns, so nothing could warn.

// The elements a partial digestion leaves short (held in zircon, rutile, other resistant minerals).
export const RESISTANT_ELEMENTS = new Set(["Zr", "Hf", "Nb", "Ta", "Y", "La", "Ce", "Pr", "Nd", "Sm", "Eu", "Gd", "Tb", "Dy", "Ho", "Er", "Tm", "Yb", "Lu"]);
// Four-acid and aqua-regia packages (ALS ME-MS61 / ME-ICP61 / ME-MS41 / ME-ICP41, Bureau Veritas MA2xx / AQ2xx, SGS GE_ICP40 ...),
// as lab codes or words. A total (fusion / lithium-borate) code (ME-MS81, LF, FUS, XRF) does not match.
export const PARTIAL_DIGESTION = /\b(ME-?MS6[1-9]|ME-?ICP6[1-9]|ME-?MS4[1-9]|ME-?ICP4[1-9]|MS6[1-9]|ICP6[1-9]|MS4[1-9]|ICP4[1-9]|MA2\d\d|AQ2\d\d|GE_?ICP4\dQ?|GE_?IMS4\dQ?|4A|4-?ACID|FOUR[- ]?ACID|AQUA[- ]?REGIA|AR)\b/i;

// The method-code column for one element in a wide file: 'zr_analysis_code', 'Zr method', 'ZR_ppm_method' ...
export function methodColumnFor(headers, symbol) {
  const s = String(symbol).toLowerCase();
  return (headers || []).find((h) => {
    const n = String(h).toLowerCase().replace(/[\s-]+/g, "_");
    return (n.startsWith(`${s}_`) || n.startsWith(`${s}(`)) && /(analysis_code|method|meth_code|lab_code|procedure)/.test(n);
  }) || null;
}

// The distinct codes in that column (up to 6).
export function methodsIn(rows, column) {
  if (!column) return [];
  const seen = new Set();
  for (const r of rows || []) { const v = String(r[column] ?? "").trim(); if (v) seen.add(v); if (seen.size >= 6) break; }
  return [...seen];
}

// [[symbol, method]] for the required elements measured by a partial digestion, from assayElements' kept methods.
export function partialDigestionFor(elements, symbols) {
  const by = new Map((elements || []).map((e) => [e.symbol, e]));
  const out = [];
  for (const sym of symbols || []) {
    if (!RESISTANT_ELEMENTS.has(sym)) continue;
    const m = (by.get(sym)?.methods || []).find((x) => PARTIAL_DIGESTION.test(x));
    if (m) out.push([sym, m]);
  }
  return out;
}
