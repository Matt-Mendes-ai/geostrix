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

// Text -> { rows, headers, note, errors }. Header row, typed values, blank lines skipped, lines starting
// with "#" skipped (GeoStrix's own export stamp, #404), comma decimals converted where provable (#284).
export function parseTableText(text, { comments = "#" } = {}) {
  const res = Papa.parse(text, { header: true, dynamicTyping: true, skipEmptyLines: true, comments });
  const { rows, note } = normalizeCommaDecimals(res.data);
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
