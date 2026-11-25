// TASKS.csv #4060 — Queensland's SL3 'H / D' text tables (the Geological Survey of Queensland's company-submission template for drillhole and geochemistry
// data): tab-delimited, every row padded with tabs to the table's width, a record code in the first field. H rows are the header block (H0100 tenement,
// H0501 datum, H0531 zone ...), H1000 / H1001 / H1002 the column NAMES (the template is loose about which: collars, logs and structure name the columns on H1000,
// geochemistry on H1001, an IP file on H1002) with the UNITS on a row labelled 'Units' or in the first D row, D rows the data (a D, an empty field, then the
// values), and a closing EOF row. Read here into an ordinary table the importers already know: the names as the header (a unit as 'Au (ppm)', the form the
// assay import reads units from), the D rows as its rows, a certified reference standard that sits inline (a 'Standard ID' filled) marked as a standard.
// Pure.
import Papa from "papaparse"; // #4067 — the comma flavour
import { t as tr } from "./i18n.js";

const HEAD = /^H\d{3,4}\t/m; // 'H151' (three digits) is in the real files
const UNIT = /^(ppm|ppb|ppt|%|pct|wt%|g\/t|gpt|oz\/t|opt|mg\/kg|g\/cc|g\/cm3|kg\/m3|t\/m3|cps|si|siu|si\s?x\s?10-?3|10-3\s?si|x10-3|mv\/v|mrad|ohm\.?m|m|mm|cm|km|deg|degrees|ft|µs\/m|us\/m|ms\/m|s\/m)$/i;
const isNumber = (s) => s !== "" && Number.isFinite(Number(s));

// TASKS.csv #4067 — the same table saved as a COMMA-delimited CSV (the GSQ's cr_118871_8..14 .csv files, with a UTF-8 BOM that tabular.js strips first): the same
// H / D records, a field per comma, quoted when a cell holds a comma or a line end (an H1000 names row runs over two lines), read with the CSV reader.
const HEAD_COMMA = /^H\d{3,4},/m;
const commaFlavour = (text) => !HEAD.test(String(text || "").slice(0, 20000)) && HEAD_COMMA.test(String(text || "").slice(0, 20000)) && /^D,/m.test(String(text || ""));
export const isSl3 = (text) => (HEAD.test(String(text || "").slice(0, 20000)) && /^D\t/m.test(String(text || ""))) || commaFlavour(text);

// -> { text (an ordinary tab table), note, qc: n standards, names: the header's names, units: { name: unit } } | null when it is not an SL3 table
export function sl3ToTable(text) {
  if (!isSl3(text)) return null;
  const heads = [], rows = [], comma = commaFlavour(text); // comma: #4067
  const records = comma ? Papa.parse(String(text), { delimiter: ",", skipEmptyLines: true }).data : String(text).split("\n").map((raw) => raw.replace(/\r$/, "")).filter(Boolean).map((line) => line.split("\t"));
  for (const f of records) {
    const code = String(f[0] ?? "").trim();
    if (code === "D") rows.push(f);
    else if (/^H\d{3,4}$/.test(code)) heads.push({ num: Number(code.slice(1)), f });
  }
  if (!rows.length) return null;
  const from = rows.every((r) => r[1] === "" || r[1] == null) ? 2 : 1; // 'D', an empty field, then the values
  const cells = (f) => f.slice(comma ? from : 2); // #4067 — the comma files' names and units sit where their values do (the label of H1001 over the hole id)
  const filled = (a) => a.filter((x) => x !== "").length;
  // the names: the column-name record with the most names that read as names
  const cands = heads.filter((h) => h.num >= 1000).map((h) => ({ ...h, v: cells(h.f) })).filter((h) => filled(h.v) >= 2 && h.v.filter((x) => x !== "" && !isNumber(x)).length >= 0.6 * filled(h.v));
  if (!cands.length) return null;
  const pool = comma && cands.some((h) => h.num === 1000) ? cands.filter((h) => h.num === 1000) : cands; // #4067 — the comma files name the columns on H1000 (H1001 is their units)
  const best = pool.sort((a, b) => filled(b.v) - filled(a.v) || /field_?names/i.test(b.f[1]) - /field_?names/i.test(a.f[1]) || a.num - b.num)[0];
  let width = best.v.length;
  while (width > 0 && best.v[width - 1] === "") width--;
  if (width < 2) return null;
  let names = best.v.slice(0, width).map((n, i) => (n.trim() === "" ? `Column ${i + 1}` : n.trim().replace(/\s*\*+$/, ""))); // #4067 — 'MGA_E*': the template marks its required fields
  const seen = new Map();
  names = names.map((n) => { const k = n.toLowerCase(), c = (seen.get(k) || 0) + 1; seen.set(k, c); return c > 1 ? `${n} (${c})` : n; }); // 'Type' twice in a pXRF file
  const data = rows.map((r) => r.slice(from).concat(Array(width).fill("")).slice(0, width).map((x) => x.trim()));
  // the units: a record labelled Units, else a first D row that is mostly units ('ppm', '%', 'g/cc')
  let units = null;
  const unitRec = heads.find((h) => h.num !== best.num && /^\(?units?( of measure)?\)?$/i.test(String(h.f[1] || "").trim()) && filled(cells(h.f)) >= 1);
  if (unitRec) units = cells(unitRec.f).concat(Array(width).fill("")).slice(0, width).map((x) => x.trim());
  else if (data.length) {
    const r = data[0], u = r.filter((x) => x !== "" && UNIT.test(x)).length;
    if (u >= 3 && u >= 0.7 * (filled(r) - 1)) { units = r.map((x) => (UNIT.test(x) ? x : "")); data.shift(); }
  }
  const unitOf = {};
  if (units) names = names.map((n, i) => { if (units[i] && UNIT.test(units[i]) && !/\(.*\)\s*$/.test(n)) { unitOf[n] = units[i]; return `${n} (${units[i]})`; } return n; });
  // a certified reference standard that sits inline: its Standard ID is filled (and its depth cells hold the word 'Standard' or nothing)
  const sid = names.findIndex((n) => /^(standard|std|crm)[\s_-]*(id|name|code)?$/i.test(n.replace(/\s*\(.*\)$/, "")));
  let qc = 0, typeCol = names.findIndex((n) => /^(sample[\s_-]*)?type$/i.test(n));
  const qcNames = new Set();
  if (sid >= 0) {
    const isStd = (r) => r[sid] !== "";
    if (data.some(isStd)) {
      if (typeCol < 0) { names.push("Sample type"); typeCol = names.length - 1; data.forEach((r) => r.push("")); }
      data.forEach((r) => { if (isStd(r)) { r[typeCol] = "Standard"; qc++; qcNames.add(r[sid]); } });
    }
  }
  // the notes: what the header says about the coordinates, whether the azimuths are magnetic, how many standards
  const note = [tr("Read as a Queensland SL3 table ({n} rows, {m} columns; the column names are on record H{h}{u}).", { n: data.length.toLocaleString(), m: names.length, h: best.num, u: unitRec || units ? tr(", the units too") : "" })];
  const val = (re) => { const h = heads.find((x) => re.test(String(x.f[1] || "").trim())); return h ? h.f.slice(2).find((x) => x !== "")?.replace(/^"|"$/g, "") || "" : ""; }; // #4067 — the value after the record's code and label, in either flavour
  const datum = val(/^geodetic_?datum$/i), zone = val(/^projection_?zone$/i);
  if (datum || zone) note.push(tr("Coordinates: {v} (from the header block).", { v: [datum, zone ? tr("zone {z}", { z: zone }) : ""].filter(Boolean).join(", ") }));
  const gcol = names.findIndex((n) => /^(survey_?)?(grid|azi(muth)?_?(ref|type|grid))$/i.test(n.replace(/[\s()]/g, "_").replace(/_+$/, "")));
  if (gcol >= 0) {
    const vs = data.map((r) => r[gcol]).filter((x) => x !== ""), mag = vs.filter((x) => /^mag/i.test(x)).length;
    if (vs.length && mag >= vs.length / 2) note.push(tr("The azimuths are magnetic (column {c}): choose the declination when you map the survey.", { c: names[gcol] }));
    else if (vs.length && vs.filter((x) => /^(grid|mga|amg|true)/i.test(x)).length >= vs.length / 2) note.push(tr("The azimuths are on the grid or true north (column {c}), not magnetic.", { c: names[gcol] }));
  }
  if (qc) note.push(tr("{n} inline certified reference standard(s) ({names}) are marked as standards, not samples.", { n: qc, names: [...qcNames].slice(0, 3).join(", ") + (qcNames.size > 3 ? ", …" : "") }));
  const cell = (x) => (/["\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x); // a quote inside a cell ('5" core') must not open a quoted field in the CSV reader
  return { text: [names.map(cell).join("\t"), ...data.map((r) => r.map(cell).join("\t"))].join("\n") + "\n", note: note.join(" "), qc, names, units: unitOf };
}
