// TASKS.csv #2018 (review #2013, Import) — a database export (MX Deposit, acQuire) writes a censoring flag BESIDE each value:
// au_ppm = 0.0005 with au_flag = 'LDL'. The wide import read the number only, so 1,268 below-detection and 2 over-range results on
// Woodjam became plain values (Au 0.0005 = half of 0.001, unqualified) and the plots claimed a substitution the app could not know of.
// A flag column for an element now gives the row its qualifier ('<' / '>'), the value kept as the file has it. Pure: no React.

const FLAG_SUFFIX = /^(?:flag|qual|qualifier|dl_?flag|det_?flag|detection_?flag|censor(?:ed|ing)?)$/i;

// the element's own prefix in a header: 'au_ppm' / 'Au ppm' / 'AU' -> 'au'
const prefixOf = (h) => String(h ?? "").trim().toLowerCase().split(/[\s_\-.()]+/)[0];

// chosen: [{ symbol, header }] -> Map(symbol -> the flag column's header), from headers like 'au_flag', 'Au_qual', 'AU FLAG'
export function flagColumns(headers, chosen) {
  const out = new Map();
  const byPrefix = new Map();
  for (const h of headers || []) {
    const parts = String(h ?? "").trim().split(/[\s_\-.]+/);
    if (parts.length < 2) continue;
    const suffix = parts.slice(1).join("_");
    if (FLAG_SUFFIX.test(suffix) || FLAG_SUFFIX.test(parts[parts.length - 1])) byPrefix.set(parts[0].toLowerCase(), h); // 'au_flag', 'au_ppm_flag'
  }
  for (const e of chosen || []) {
    const h = byPrefix.get(String(e.symbol).toLowerCase()) ?? byPrefix.get(prefixOf(e.header));
    if (h != null && h !== e.header) out.set(e.symbol, h);
  }
  return out;
}

// a flag cell -> '<' (below the lower detection limit), '>' (over the upper limit) or null (a plain result, or a code it does not know)
export function flagQualifier(cell) {
  const s = String(cell ?? "").trim().toUpperCase().replace(/[\s_.-]+/g, "");
  if (!s) return null;
  if (/^(<|LDL|BDL|BLD|<DL|<LDL|LT|LTDL|ND|NOTDETECTED|BELOWDETECTION(LIMIT)?|BELOWDL)$/.test(s)) return "<";
  if (/^(>|UDL|ODL|ADL|>DL|>UDL|GT|GTDL|OL|OVERLIMIT|OVERRANGE|ABOVEDETECTION(LIMIT)?|ABOVEDL)$/.test(s)) return ">";
  return null;
}

// how many of `rows` hold a below-detection ('<') value for any of `symbols`: a drillhole assay's qualifiers, a surface sample's
// bdl list. The plot footers say the half-detection rule only for those, not for every sample (#2018).
export function censoredSamples(rows, symbols) {
  const syms = [...new Set(symbols || [])];
  let n = 0;
  for (const r of rows || []) if (syms.some((s) => r?.qualifiers?.[s] === "<" || r?.bdl?.includes?.(s))) n++;
  return n;
}
