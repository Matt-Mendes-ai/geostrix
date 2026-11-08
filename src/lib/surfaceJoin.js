// TASKS.csv #1670 (review #1646, Kodiak) — soils come as two workbooks, a field data sheet and the lab's assay sheet, joined by the sample
// number (Kodiak: Appendix E, 2,911 rows of field data, and F, 2,707 rows of assays with the coordinates; 2,910 numbers in common). The surface
// import took one file. joinBySampleId adds a second table's columns to the first one's rows where the sample ids match.
//   - ids compare trimmed and case-blind; '1234' and '1234.0' are the same id (a number cell read from a workbook)
//   - a column both tables have fills only the first table's blank cells (F repeats E's coordinates); it is not added twice
//   - a second-table id seen twice: its first row is used, and the count is reported
// -> { headers, rows (plain objects), added: [column], filled: number of cells, matched, baseOnly, addOnly, addDuplicates }
export const sampleIdKey = (v) => {
  const s = String(v ?? "").trim().toUpperCase();
  return /^-?\d+\.0+$/.test(s) ? s.replace(/\.0+$/, "") : s;
};
const blank = (v) => v == null || (typeof v === "string" && v.trim() === "") || (typeof v === "number" && Number.isNaN(v));

export function joinBySampleId(base, add) {
  const { headers: bh, rows: br, idCol: bid } = base;
  const { headers: ah, rows: ar, idCol: aid } = add;
  const byId = new Map();
  let addDuplicates = 0;
  for (const r of ar) { const k = sampleIdKey(r[aid]); if (!k) continue; if (byId.has(k)) { addDuplicates++; continue; } byId.set(k, r); }
  const inBase = new Set(bh);
  const added = ah.filter((h) => h !== aid && !inBase.has(h));
  const shared = ah.filter((h) => h !== aid && inBase.has(h));
  const headers = [...bh, ...added];
  let matched = 0, filled = 0;
  const seen = new Set();
  const rows = br.map((r) => {
    const o = {};
    for (const h of bh) o[h] = r[h]; // plain objects: a large file's rows are column views (#611)
    const k = sampleIdKey(r[bid]);
    const m = k ? byId.get(k) : null;
    if (m) {
      matched++; seen.add(k);
      for (const h of added) o[h] = m[h];
      for (const h of shared) if (blank(o[h]) && !blank(m[h])) { o[h] = m[h]; filled++; }
    }
    return o;
  });
  return { headers, rows, added, filled, matched, baseOnly: br.length - matched, addOnly: [...byId.keys()].filter((k) => !seen.has(k)).length, addDuplicates };
}
