// TASKS.csv #3549 (QC links step 2, option D of docs/ideas/qc-link-table.md) — assays with NO sample ids: two rows over the same hole and interval may be a field duplicate and its original, a lab re-assay, or the
// same file imported twice. They are SUGGESTED as pairs, by hole and depth, and nothing is written until the user confirms each pair: a confirmed pair gives the later row the sample type 'field duplicate' and its
// parent (the earlier row's sample id; an id is made for a row that has none, '<hole>_<from>-<to>'), so the existing QC tools (duplicate pairs, the exclusion of QC inserts) read it as a check sample.
// Never guessed silently: an interval met three or more times is not suggested (which row is the original?), a pair with identical values is flagged (a double import, not a duplicate). Pure.
import { classifyQAQCRow } from "./qaqc.js";

const sid = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
const keyOf = (r) => `${r.hole_id}|${r.from}|${r.to}`;
const idOf = (r) => (r.sample_id != null && String(r.sample_id).trim() !== "" ? String(r.sample_id).trim() : "");
const sameValues = (a, b) => JSON.stringify(a.values ?? null) === JSON.stringify(b.values ?? null);

// assays -> { pairs: [{ key, hole_id, from, to, original: index, duplicate: index, identical, ids: boolean }], ambiguous: number of rows in intervals met 3+ times, regularRows }
//   original / duplicate are indexes into `assays`; with sample ids on both rows the lower id (natural order) is the original, else the first row of the file.
export function suggestPairs(assays) {
  const groups = new Map();
  (assays || []).forEach((r, i) => {
    if (!r || r.hole_id == null || !Number.isFinite(Number(r.from)) || !Number.isFinite(Number(r.to))) return;
    if (classifyQAQCRow(r) !== "regular") return; // a standard, a blank or a marked duplicate is already a QC row
    const k = keyOf(r);
    (groups.get(k) || groups.set(k, []).get(k)).push(i);
  });
  const pairs = []; let ambiguous = 0;
  for (const [key, idx] of groups) {
    if (idx.length < 2) continue;
    if (idx.length > 2) { ambiguous += idx.length; continue; }
    let [a, b] = idx;
    const ra = assays[a], rb = assays[b], ia = idOf(ra), ib = idOf(rb);
    if (ia && ib && sid.compare(ib, ia) < 0) [a, b] = [b, a];
    pairs.push({ key, hole_id: assays[a].hole_id, from: assays[a].from, to: assays[a].to, original: a, duplicate: b, identical: sameValues(ra, rb), ids: !!(ia && ib) });
  }
  return { pairs, ambiguous };
}

// assays, the confirmed pairs (from suggestPairs) -> { rows: a new array, marked: n }; rows not in a confirmed pair are the same objects
export function applyPairs(assays, confirmed) {
  const rows = (assays || []).slice(); let marked = 0;
  const taken = new Set(rows.map(idOf).filter(Boolean));
  const fresh = (base) => { let id = base, n = 1; while (taken.has(id)) id = `${base}_${++n}`; taken.add(id); return id; };
  for (const p of confirmed || []) {
    const o = rows[p.original], d = rows[p.duplicate];
    if (!o || !d || classifyQAQCRow(d) !== "regular") continue;
    const oid = idOf(o) || fresh(`${o.hole_id}_${o.from}-${o.to}`);
    const did = idOf(d) || fresh(`${oid}_DUP`);
    rows[p.original] = idOf(o) ? o : { ...o, sample_id: oid };
    rows[p.duplicate] = { ...d, sample_id: did, parent_id: oid, sample_type: "field duplicate" };
    marked++;
  }
  return { rows, marked };
}
