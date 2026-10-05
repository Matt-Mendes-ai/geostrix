// TASKS.csv #444 — one CSV reader and one CSV writer for the whole app. Before this, six separate
// Papa.parse calls each had a different subset of the fixes: #284's comma-decimal handling lived only in
// the 3D View and Geochem importers (so a European-locale point survey or block model failed in
// Geophysics with a misleading "looked for x/y/z" message), and the Windows-1252 fallback for Excel exports
// lived only in the outcrop-structure importer. On the writing side, a hand-built `join(",")` corrupted any
// field containing a comma or quote. Pure (no DOM, no Electron): unit-tested in Node.
import Papa from "papaparse";
import { normalizeCommaDecimals } from "./numberLocale.js";

// Bytes -> text. UTF-8 first (BOM stripped); if that produced replacement characters, the file was not
// UTF-8 — almost always an Excel export on Windows (Windows-1252: degree signs, accented names).
export function decodeTableBytes(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let text = new TextDecoder("utf-8").decode(u8);
  let encoding = "utf-8";
  if (text.includes("�")) { text = new TextDecoder("windows-1252").decode(u8); encoding = "windows-1252"; }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return { text, encoding };
}

// TASKS.csv #509 — identifier columns are read as TEXT. Typing every column turned hole ids "0045" into 45,
// "1.10" into 1.1 and "1E3" into 1000: the ids no longer matched the company database (or a Postgres collar
// table, which keeps "0045"), and distinct holes ("01" / "001") merged. A header counts as an identifier when
// it names a hole / sample / collar (the same words the importers' hole-id guess uses), unless it is
// plainly a measurement of one (hole_depth, sample_weight, sample_from...).
const ID_WORD = /(hole|bhid|dhid|sample|samp_?id|collar_?id|drill_?id)/;
const MEASURE_WORD = /(depth|length|len$|dip|azi|^az|_az|dia(m|meter)?$|size|from|to$|_to_|elev|east|north|recov|rqd|weight|wt|mass|count|interval|eoh|_m$|_ft$|grade|value)/;
export function isIdentifierHeader(h) {
  const k = String(h ?? "").trim().toLowerCase().replace(/[\s.\-/]+/g, "_");
  return ID_WORD.test(k) && !MEASURE_WORD.test(k);
}

// Text -> { rows, headers, note, errors }. Header row, typed values (identifier columns kept as text, #509),
// blank lines skipped, lines starting with "#" skipped (GeoStrix's own export stamp, #404), comma decimals
// converted where provable (#284).
const QUOTED_COMMA_NUMBER = /"\s*[+-]?\d+(?:\.\d{3})*,\d+\s*"/;
export function parseTableText(text, { comments = "#" } = {}) {
  // #600 (performance) — Papa asks once per CELL; the answer depends only on the header, so cache it per header.
  const typed = new Map();
  const dynamicTyping = (field) => { let v = typed.get(field); if (v === undefined) { v = !isIdentifierHeader(field); typed.set(field, v); } return v; };
  const res = Papa.parse(text, { header: true, dynamicTyping, skipEmptyLines: true, comments });
  // TASKS.csv #600 (40958Z, performance) — in a COMMA-delimited file a comma-decimal value can only exist quoted
  // ("1,5"), so when the raw text has no quoted comma number the column-by-column scan (every row x column:
  // 1.4 s of a 4.4 s parse on an 83,670 x 109 assay export) is skipped. Semicolon / tab files are scanned as before.
  const commaFree = res.meta.delimiter === "," && !QUOTED_COMMA_NUMBER.test(text);
  const { rows, note } = commaFree ? { rows: res.data, note: "" } : normalizeCommaDecimals(res.data);
  return { rows, headers: res.meta.fields || [], note: note || "", errors: res.errors || [] };
}

// A File/Blob (browser or Electron renderer) -> the same, plus a note when the encoding fallback was used.
export async function parseTableFile(file, opts) {
  const { text, encoding } = decodeTableBytes(await file.arrayBuffer());
  const out = parseTableText(text, opts);
  if (encoding !== "utf-8") out.note = `${out.note ? `${out.note} ` : ""}Read as Windows-1252 (the file is not UTF-8 — typical of an Excel export).`.trim();
  return { ...out, encoding };
}

// Rows (objects, or { fields, data }) -> CSV text with correct quoting (commas, quotes, newlines).
export const toCsv = (rows, opts) => Papa.unparse(rows, opts);
