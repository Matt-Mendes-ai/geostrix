// TASKS.csv #1778 (review #1645, Copley) — Layout legends listed bare logging codes (ANDS, HYBX, IFGD, 'shr'): a reader of the report
// could not decode them, and the only route was retyping each row per legend. A code -> description table (CSV) now sets the layer's
// legend labels once (theme.legendOverride, the labels every legend, section key and strip log already read). Pure.
//
// rows: the CSV's rows (arrays of cells, e.g. from Papa.parse); codes: the layer's codes. Columns: a header naming a code column (code,
// abbrev, unit, lith, value...) and a description column (description, desc, name, meaning, label...), else the first two columns.
// Codes match case-insensitively, trimmed. -> { apply: [{ value (the layer's own spelling), label }], unmatched: [codes in the file not
// in the layer], header: bool }
const CODE_COL = /^(code|codes|abbrev(iation)?|unit|lith(ology)?(_?code)?|alt(eration)?(_?code)?|value|symbol|key)$/i;
const DESC_COL = /^(desc(ription)?|name|meaning|label|long(_?name)?|lith(ology)?_?desc(ription)?|text)$/i;

export function codeDescriptions(rows, codes) {
  const clean = (rows || []).map((r) => (Array.isArray(r) ? r : []).map((c) => String(c ?? "").trim())).filter((r) => r.some((c) => c));
  if (!clean.length) return { apply: [], unmatched: [], header: false };
  const first = clean[0];
  const ci = first.findIndex((c) => CODE_COL.test(c.replace(/\s+/g, "_"))), di = first.findIndex((c) => DESC_COL.test(c.replace(/\s+/g, "_")));
  const header = ci >= 0 && di >= 0 && ci !== di;
  const [c0, d0] = header ? [ci, di] : [0, 1];
  const byKey = new Map((codes || []).map((v) => [String(v).trim().toLowerCase(), v]));
  const apply = [], unmatched = [], seen = new Set();
  for (const r of header ? clean.slice(1) : clean) {
    const code = r[c0] ?? "", label = r[d0] ?? "";
    if (!code || !label) continue;
    const key = code.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (byKey.has(key)) apply.push({ value: byKey.get(key), label });
    else unmatched.push(code);
  }
  return { apply, unmatched, header };
}
