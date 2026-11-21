// TASKS.csv #3923 (user feedback, Portuguese: "I could not import assay columns such as gold equivalent, silver equivalent, total rare earths ... it seems it
// only accepts chemical elements") — the assay import recognised only element and oxide column names; a numeric column such as AuEq_gpt or TREO_ppm was
// neither offered nor read, and the one line that said so came after the import. Now the dialog offers every numeric column it did not read as an assay of
// its own, named and given a unit from its header as typed, kept AS SUPPLIED (the lab's or the company's number, never recalculated) and treated everywhere
// as an ordinary numeric assay. Pure.
import { isElementColumn, isLoiHeader } from "./geochem.js"; // as assayExtraFields.js (the column helpers)
import { isTextColumn } from "./assayExtraFields.js";

// a column whose name says what it is (geometry, ids, dates, flags) is not a grade
const NOT_A_GRADE = /^(x|y|z|e|n|east(ing)?|north(ing)?|elev(ation)?|rl|dip|azimuth|az|depth|length|width|interval|thick(ness)?|recovery|rqd|sample[\s_-]*(no|id|num(ber)?)|id|no|number|seq(uence)?|batch|job|weight|wt|kg|mass|fire[\s_-]*assay)$/i;
const NOT_A_GRADE_WORD = /\b(status|certificate|cert|laboratory|lab|method|date|completed|analys(is|ed)|comment|flag|qc|error|err|lod|dl)\b/i;
// what a column calls itself: an equivalent (AuEq, Ag_Eq, CuEq, "gold equivalent") or a total / sum (TREO, TREM, REO, total rare earths)
export const EQUIVALENT_HEADER = /(^|[^a-z])(eq|equiv(alent)?)([^a-z]|$)|[a-z]eq([^a-z]|$)|equivalent/i;
export const TOTAL_HEADER = /\b(treo|trem|reo|ree|total|sum|tot)\b|(^|_)(treo|trem|reo|ree)(_|$)/i;
export const columnKind = (header) => (EQUIVALENT_HEADER.test(String(header)) ? "equivalent" : TOTAL_HEADER.test(String(header).replace(/_/g, " ")) ? "total" : "");

// the unit a header states, as the dialog's units: ppm / ppb / % and g/t (the same number as ppm; kept as typed) -> { name, unit, unitLabel, assumed }
const UNIT_TAIL = /[\s_-]*(?:\(\s*(ppm|ppb|pct|%|gpt|g\/t|wt\s*%)\s*\)|[\s_-](ppm|ppb|pct|%|gpt|g\/t|g_t|wt_?pct|wt%)|(ppm|ppb|pct|gpt))\s*$/i;
export function nameAndUnit(header) {
  const h = String(header ?? "").trim();
  const m = UNIT_TAIL.exec(h);
  const tok = (m && (m[1] || m[2] || m[3]) || "").toLowerCase().replace(/\s/g, "");
  const unit = tok === "ppb" ? "ppb" : tok === "ppm" ? "ppm" : /^(pct|%|wt%|wt_?pct)$/.test(tok) ? "%" : /^(gpt|g\/t|g_t)$/.test(tok) ? "ppm" : null;
  let name = (m ? h.slice(0, m.index) : h).replace(/[\s_-]+$/, "").replace(/[^\p{L}\p{N} _.+-]/gu, "").trim();
  if (!name) name = h.replace(/[^\p{L}\p{N} _.+-]/gu, "").trim() || h;
  return { name, unit: unit || "ppm", unitLabel: /^(gpt|g\/t|g_t)$/.test(tok) ? "g/t" : null, assumed: !unit };
}

// the file's numeric columns the import did not read -> [{ header, name, unit, unitLabel, assumed, kind, filled }], equivalents and totals first, then file order.
// used: assayUsedColumns(mapping, qc, elements); a sample of the rows tells a numeric column from a text one (the dialog's rule)
export function otherNumericColumns(headers, rows, used = new Set(), sample = 500) {
  const out = [];
  const head = (rows || []).slice(0, sample);
  for (const h of headers || []) {
    if (!h || used.has(h) || isElementColumn(h) || isLoiHeader(h)) continue;
    const bare = String(h).trim();
    if (NOT_A_GRADE.test(bare) || NOT_A_GRADE_WORD.test(bare.replace(/_/g, " "))) continue;
    let filled = 0;
    for (const r of head) { const v = r?.[h]; if (v != null && String(v).trim() !== "") filled++; }
    if (!filled || isTextColumn(head, h)) continue;
    out.push({ header: h, ...nameAndUnit(h), kind: columnKind(h), filled });
  }
  const rank = (c) => (c.kind ? 0 : 1);
  return out.map((c, i) => [c, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map((x) => x[0]);
}

// a name no other assay in the dialog or the project already has (case-insensitive): 'AuEq' -> 'AuEq' or 'AuEq (supplied)', 'AuEq (supplied 2)' ...
export function freeName(name, taken) {
  const t = new Set([...(taken || [])].map((s) => String(s).toLowerCase()));
  if (!t.has(String(name).toLowerCase())) return name;
  for (let k = 1; k < 100; k++) { const n = `${name} (supplied${k > 1 ? ` ${k}` : ""})`; if (!t.has(n.toLowerCase())) return n; }
  return `${name} (supplied)`;
}

// the dialog's element entry for a column: kept as supplied (never recalculated), an ordinary numeric assay once imported
export function customAssayEntry(col, rows, taken) {
  let n = 0;
  for (const r of rows || []) { const v = r?.[col.header]; if (v != null && String(v).trim() !== "") n++; }
  return {
    symbol: freeName(col.name, taken), header: col.header, unit: col.unit, ...(col.unitLabel ? { unitLabel: col.unitLabel } : {}),
    checked: n > 0, n, custom: true, asSupplied: true, ...(col.kind ? { kind: col.kind } : {}),
  };
}

// TASKS.csv #3923 — the project's assays in more than one unit once an as-supplied column is in (AuEq in g/t beside Cu in %, TREO in ppm): each is kept and shown in
// its own unit, so a sum or a ratio of two of them needs one unit. -> "% (Cu), ppm (Au, AuEq, TREO)" | null (one unit only, or nothing supplied)
export function mixedUnitsList(projectElements, chosen) {
  const supplied = (chosen || []).filter((e) => e?.asSupplied);
  if (!supplied.length) return null;
  const by = new Map();
  const put = (symbol, unit) => { const base = /%/.test(String(unit)) ? "%" : /ppb/.test(String(unit)) ? "ppb" : "ppm"; (by.get(base) || by.set(base, new Set()).get(base)).add(symbol); };
  for (const e of projectElements || []) put(e.symbol, e.unit);
  for (const e of chosen || []) if (e.checked !== false) put(e.symbol, e.unit);
  if (by.size < 2) return null;
  return [...by].map(([u, s]) => `${u} (${[...s].slice(0, 6).join(", ")}${s.size > 6 ? ", …" : ""})`).join(", ");
}
