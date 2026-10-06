// TASKS.csv #605 — Excel workbooks (.xlsx) as import sources. Real drillhole databases are often delivered as
// one workbook with a sheet per table (a BC ARIS report: DH Collar, DH Survey, Lithology, Alteration,
// Mineralization, Structure (int) / (pt), Vein, Breccia, Specific Gravity, Mag Susc, Assay Samples), and
// GeoStrix read only CSV. Each worksheet is turned into CSV text so it goes through the SAME import path as a
// dropped CSV (type detection, column guesses, the mapping dialog) — no second importer to keep in step.
// Dependency-free: the .xlsx container is read with the app's capped zip reader (shapefile.js, #351 limits)
// and the sheet XML with a few patterns (OOXML is machine-written and regular). Dates stay as Excel serial
// numbers (no drillhole field needs them); formulas give their cached value. Pure; tested in test/core.test.mjs.
import { readZipEntries } from "./shapefile.js";
import { toCsv, parseTableFile, parseTableText } from "./tabular.js";

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const unxml = (s) => String(s).replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e) =>
  e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[e.toLowerCase()]);
const textOf = (xml) => { const t = []; xml.replace(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g, (_, v) => { t.push(v); return ""; }); return unxml(t.join("")); };
const attrs = (s) => { const o = {}; s.replace(/([\w:]+)="([^"]*)"/g, (_, k, v) => { o[k] = v; return ""; }); return o; };
const colIndex = (ref) => { const letters = /^[A-Z]+/i.exec(ref || "")?.[0].toUpperCase() || ""; let n = 0; for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };

export const isXlsxName = (name) => /\.xlsx$/i.test(String(name || ""));

// bytes -> [{ name, rows: string[][] }] in workbook order (hidden sheets included, flagged).
export async function readXlsxSheets(bytes) {
  const want = /^(xl\/workbook\.xml|xl\/_rels\/workbook\.xml\.rels|xl\/sharedStrings\.xml|xl\/worksheets\/[^/]+\.xml)$/;
  const z = await readZipEntries(bytes, want);
  const dec = (k) => (z[k] ? new TextDecoder().decode(z[k]) : null);
  const wb = dec("xl/workbook.xml");
  if (!wb) throw new Error("Not an Excel workbook (no xl/workbook.xml).");
  const rels = {};
  (dec("xl/_rels/workbook.xml.rels") || "").replace(/<Relationship\b([^>]*)\/?>/g, (_, a) => { const r = attrs(a); rels[r.Id] = r.Target; return ""; });
  const shared = [];
  (dec("xl/sharedStrings.xml") || "").replace(/<si>([\s\S]*?)<\/si>/g, (_, si) => { shared.push(textOf(si)); return ""; });
  const sheets = [];
  wb.replace(/<sheet\b([^>]*)\/?>/g, (_, a) => { const s = attrs(a); sheets.push({ name: unxml(s.name || "Sheet"), rid: s["r:id"], hidden: s.state && s.state !== "visible" }); return ""; });
  return sheets.map((s) => {
    let target = rels[s.rid] || "";
    target = target.replace(/^\//, "");
    if (!target.startsWith("xl/")) target = `xl/${target}`;
    const xml = dec(target) || "";
    const rows = [];
    xml.replace(/<row\b([^>]*)>([\s\S]*?)<\/row>/g, (_, ra, body) => {
      const r = Number(attrs(ra).r) - 1;
      const row = [];
      body.replace(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, (__, ca, inner = "") => {
        const c = attrs(ca);
        const ci = c.r ? colIndex(c.r) : row.length;
        const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
        let val = "";
        if (c.t === "s") val = shared[Number(v)] ?? "";
        else if (c.t === "inlineStr") val = textOf(inner);
        else if (c.t === "b") val = v === "1" ? "TRUE" : "FALSE";
        else if (c.t === "e") val = "";
        else if (v != null) val = unxml(v);
        row[ci] = val;
        return "";
      });
      for (let i = 0; i < row.length; i++) if (row[i] == null) row[i] = "";
      rows[Number.isFinite(r) && r >= 0 ? r : rows.length] = row;
      return "";
    });
    return { name: s.name, hidden: !!s.hidden, rows: Array.from(rows, (x) => x || []) };
  });
}

// One workbook -> one CSV text per non-empty sheet (header row + at least one data row).
export async function xlsxToCsvFiles(bytes, workbookName) {
  const base = String(workbookName || "workbook").replace(/\.xlsx$/i, "");
  const sheets = await readXlsxSheets(bytes);
  const out = [];
  for (const s of sheets) {
    const rows = s.rows.filter((r) => r.some((v) => String(v).trim() !== ""));
    if (rows.length < 2) continue;
    const width = Math.max(...rows.map((r) => r.length));
    const headers = rows[0].map((h, i) => String(h).trim() || `Column ${i + 1}`);
    while (headers.length < width) headers.push(`Column ${headers.length + 1}`);
    out.push({ name: `${base} - ${s.name}.csv`, sheet: s.name, rows: rows.length - 1, text: toCsv({ fields: headers, data: rows.slice(1).map((r) => headers.map((_, i) => r[i] ?? "")) }) });
  }
  return out;
}

// A table file for an importer that takes ONE table (Geochem assays / surface samples): a CSV as before, or the
// best sheet of a workbook — the sheet scoring highest on scoreHeaders(headers) (e.g. its element-column count),
// the first sheet with data on a tie or zero. Same { rows, headers, note } shape as parseTableFile.
export async function parseTableOrWorkbook(file, scoreHeaders = () => 0, opts = {}) {
  if (!isXlsxName(file.name)) return parseTableFile(file, opts); // opts.columnar: #611
  const sheets = await xlsxToCsvFiles(new Uint8Array(await file.arrayBuffer()), file.name);
  if (!sheets.length) return { rows: [], headers: [], note: "No sheet with a header row and data in this workbook.", errors: [] };
  const parsed = sheets.map((s) => ({ s, t: parseTableText(s.text) }));
  let best = parsed[0], bestScore = scoreHeaders(best.t.headers);
  for (const p of parsed.slice(1)) { const sc = scoreHeaders(p.t.headers); if (sc > bestScore) { best = p; bestScore = sc; } }
  const others = sheets.length > 1 ? ` (${sheets.length} sheets with data; only this one is read here — drop the workbook in the 3D view for collars, surveys and logs)` : "";
  return { ...best.t, sheet: best.s.sheet, note: `Sheet "${best.s.sheet}"${others}.${best.t.note ? ` ${best.t.note}` : ""}` };
}
