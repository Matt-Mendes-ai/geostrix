// TASKS.csv #3409 (option B of docs/ideas/qc-link-table.md; Matt: "say it plainly with 0 matches, later links pair up") — a QC link table (sample id, parent
// sample id, QC category: no results) read as links and applied to the assay rows the project already has, by sample id, so the QC tools (duplicate pairs,
// blank and standard charts, the QC filters) see them as check samples. The links are kept with the project: assays imported later pair up as they arrive.
// No guess by hole and depth (a duplicate over a split interval would be paired wrongly): a row with no sample id cannot be reached, and is counted. Pure.
import { sampleTypeClass } from "./qaqcCore.js";

// the key a sample id is compared by: trimmed, lower case, a number written 12345.0 read 12345
export const idKey = (v) => { const s = String(v ?? "").trim().toLowerCase(); return /^-?\d+\.0+$/.test(s) ? s.replace(/\.0+$/, "") : s; };

// rows of the link table + its columns ({ sample_id, parent_id, sample_type }: the dialog's QC column choices) -> { links, blank, repeated }
// a link: { sample_id, parent_id, sample_type } (the file's own words); a row with no sample id, or with neither a parent nor a category, is blank;
// unknownTypes: categories the QC tools do not recognise (they would not mark the row as a duplicate, blank or standard)
export function readLinks(rows, cols = {}) {
  const byId = new Map(), unknown = new Set();
  let blank = 0, repeated = 0;
  const get = (r, k) => { const c = cols[k]; const v = c ? r?.[c] : null; return v == null ? "" : String(v).trim(); };
  for (const r of rows || []) {
    const sample_id = get(r, "sample_id"), parent_id = get(r, "parent_id"), sample_type = get(r, "sample_type");
    if (!sample_id || (!parent_id && !sample_type)) { blank++; continue; }
    const k = idKey(sample_id);
    if (byId.has(k)) repeated++;
    if (sample_type && !sampleTypeClass(sample_type)) unknown.add(sample_type);
    byId.set(k, { sample_id, parent_id, sample_type });
  }
  return { links: [...byId.values()], blank, repeated, unknownTypes: [...unknown] };
}

// How the project keeps its links (project.qcLinks, saved with it): three parallel arrays and a small dictionary of the categories (a table has a handful),
// { ids: [sample id], parents: [parent sample id], types: [index into dict], dict: [category text] }: a 988-row (or 40,000-row) table is a few strings per link,
// not an object per link with its three key names, so a save does not grow with it as row objects would. The older array-of-objects shape reads too.
export function packLinks(links) {
  const dict = [], at = new Map(), ids = [], parents = [], types = [];
  for (const l of links || []) {
    const t = String(l.sample_type ?? "");
    if (!at.has(t)) { at.set(t, dict.length); dict.push(t); }
    ids.push(String(l.sample_id)); parents.push(String(l.parent_id ?? "")); types.push(at.get(t));
  }
  return { ids, parents, types, dict };
}
export function unpackLinks(p) {
  if (Array.isArray(p)) return p;
  const ids = p?.ids || [];
  return ids.map((id, i) => ({ sample_id: id, parent_id: p.parents?.[i] ?? "", sample_type: p.dict?.[p.types?.[i]] ?? "" }));
}
export const linkCount = (p) => (Array.isArray(p) ? p.length : p?.ids?.length || 0);

// the links the project already keeps and new ones: a later link for the same sample id replaces the earlier
export function mergeLinks(prev, add) {
  const m = new Map();
  for (const l of [...(prev || []), ...(add || [])]) if (l && idKey(l.sample_id)) m.set(idKey(l.sample_id), { sample_id: String(l.sample_id).trim(), parent_id: String(l.parent_id ?? "").trim(), sample_type: String(l.sample_type ?? "").trim() });
  return [...m.values()];
}

// assay rows + links -> { rows, matched, changed, unmatched, noId }
//   rows: the rows with sample_type / parent_id filled from the link of their sample id (a standard's parent is its CRM, so its qc_code too, as the import does);
//   matched: how many links reached a row; changed: rows that took something new; unmatched: the sample ids no row carries; noId: rows with no sample id
export function applyLinks(assays, links) {
  const index = new Map((links || []).map((l) => [idKey(l.sample_id), l]));
  const reached = new Set();
  let changed = 0, noId = 0;
  const rows = (assays || []).map((r) => {
    const k = idKey(r?.sample_id);
    if (!k) { noId++; return r; }
    const l = index.get(k);
    if (!l) return r;
    reached.add(k);
    const next = { ...r };
    if (l.sample_type) next.sample_type = l.sample_type;
    if (l.parent_id) next.parent_id = l.parent_id;
    if (next.parent_id && !next.qc_code && sampleTypeClass(next.sample_type) === "standard") next.qc_code = next.parent_id;
    if (next.sample_type === r.sample_type && next.parent_id === r.parent_id && next.qc_code === r.qc_code) return r;
    changed++;
    return next;
  });
  const unmatched = (links || []).filter((l) => !reached.has(idKey(l.sample_id))).map((l) => l.sample_id);
  return { rows: changed ? rows : assays, matched: reached.size, changed, unmatched, noId };
}

// the sentences the import says (English keys; the caller passes tr): { text } built from the counts
export function linkReport({ links, applied, blank, repeated, unknownTypes = [], assayCount }, tr) {
  const m = links.length, out = [];
  if (!m) return tr("No link in this table: each row needs a sample id and a parent sample id or a QC category.");
  if (!applied.matched) out.push(tr("Matched 0 of {m}: the check samples' results are not in the project. The {m} links are kept: assays imported later with these sample ids pair up.", { m: m.toLocaleString() }));
  else out.push((applied.changed ? tr("Matched {n} of {m} link(s): {c} assay row(s) now carry their QC category and parent sample.", { n: applied.matched.toLocaleString(), m: m.toLocaleString(), c: applied.changed.toLocaleString() }) : tr("Matched {n} of {m} link(s): their assay rows already carry the QC category and parent sample.", { n: applied.matched.toLocaleString(), m: m.toLocaleString() })) + (applied.matched < m ? " " + tr("The other {k} are kept: assays imported later with their sample ids pair up.", { k: (m - applied.matched).toLocaleString() }) : ""));
  if (assayCount > 0 && applied.noId === assayCount) out.push(tr("None of the {n} assay rows has a sample id, so no link can reach them: import the assays with their sample id column.", { n: assayCount.toLocaleString() }));
  else if (applied.noId > 0 && applied.matched) out.push(tr("{n} assay row(s) have no sample id and cannot be reached.", { n: applied.noId.toLocaleString() }));
  if (blank) out.push(tr("{n} row(s) of the table had no sample id, or neither a parent nor a category, and were left out.", { n: blank.toLocaleString() }));
  if (unknownTypes.length) out.push(tr("The QC tools do not recognise these categories, so rows linked with them are not marked as check samples: {list}.", { list: unknownTypes.slice(0, 6).join(", ") + (unknownTypes.length > 6 ? ", …" : "") }));
  if (repeated) out.push(tr("{n} sample id(s) appeared more than once: the last row of each was kept.", { n: repeated.toLocaleString() }));
  return out.join(" ");
}
