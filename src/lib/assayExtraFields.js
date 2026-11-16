// TASKS.csv #3728 (Scottie Gold review) — the drillhole assay import dropped its text columns without a word: Zone (a prospect name on all 9,777
// rows: Blueberry, Gully …) and Target were neither imported nor named in the notice, which listed only the numeric columns it left out. The
// collar and log imports keep 'extra fields'; the assay rows had nowhere to keep one. Now the dialog offers the file's text columns as fields kept
// with each sample (row.attrs, as surface samples keep theirs), ticked by default when they hold few enough values to group by, and Grade
// statistics and Compositing offer them as domains (customDomains.attributeDomainOptions). Pure.
import { isElementColumn, isLoiHeader } from "./geochem.js";
import { SURFACE_ATTR_MAX_DISTINCT, surfaceAttrs } from "./geochemColumns.js";

// a column is text when under 80 % of its filled cells (of the first 500 rows) read as numbers: numeric columns the import does not read are
// named as 'numeric, not an element' (#2498)
const SAMPLE = 500;
export function isTextColumn(rows, h) {
  let filled = 0, numeric = 0;
  for (const r of (rows || []).slice(0, SAMPLE)) { const v = r?.[h]; if (v == null || String(v).trim() === "") continue; filled++; if (Number.isFinite(Number(String(v).replace(/^[<>]/, "")))) numeric++; }
  return filled > 0 && numeric < 0.8 * filled;
}
// the columns the import reads: the mapping, the QC columns, every element column (and its ore-grade / method columns)
export function assayUsedColumns(mapping = {}, qc = {}, elements = []) {
  const used = new Set([...Object.values(mapping || {}), ...Object.values(qc || {})].filter(Boolean));
  for (const e of elements || []) [e.header, e.mainHeader, e.overLimit?.header, ...(e.methodCols || []).map((m) => m.header)].forEach((h) => h && used.add(h));
  return used;
}
// the text columns a sample could keep -> [{ col, n (filled rows), distinct (counted up to SURFACE_ATTR_MAX_DISTINCT + 1) }], file order
export function assayTextColumns(headers, rows, used = new Set()) {
  const out = [];
  for (const h of headers || []) {
    if (!h || used.has(h) || isElementColumn(h) || isLoiHeader(h) || !isTextColumn(rows, h)) continue;
    const seen = new Set(); let n = 0;
    for (const r of rows || []) { const v = r?.[h]; if (v == null || String(v).trim() === "") continue; n++; if (seen.size <= SURFACE_ATTR_MAX_DISTINCT) seen.add(String(v).trim()); }
    if (n) out.push({ col: h, n, distinct: seen.size });
  }
  return out;
}
// ticked by default: a column with few enough values to group by (a zone, a target, a prospect); a column with more (a sample note) is offered
export const defaultExtraColumns = (cols) => (cols || []).filter((c) => c.distinct <= SURFACE_ATTR_MAX_DISTINCT).map((c) => c.col);
// the dialog's choice (modal.extraCols) or the default, limited to the columns on offer
export function chosenExtraColumns(modal, cols) {
  const offered = new Set((cols || []).map((c) => c.col));
  return (Array.isArray(modal?.extraCols) ? modal.extraCols : defaultExtraColumns(cols)).filter((c) => offered.has(c));
}
// one sample's kept fields -> { attrs } | {} (the surface samples' rule: trimmed text, the key on one line, 500 characters at most)
export const assayAttrs = (row, cols) => (cols?.length ? surfaceAttrs(row, cols) : {});
