// TASKS.csv #1351 (from the #1345 sweep) — survey files too big to read whole: Poplar's airborne magnetic CSV is 1.31 GB (2.6 million
// readings x 38 columns, a reading every ~1.5 m along the lines), the radiometrics 1.12 GB. GeoStrix refused anything over 150 MB as a
// point survey, because reading it whole (text + a row object per reading) would freeze or exhaust a modest laptop. Here the file is
// STREAMED: its header and first rows are read to choose the columns and estimate the reading count, then the whole file is read in
// chunks, keeping every n-th data row and only the columns asked for, so neither the whole text nor 2.6 million row objects exist.
// Pure apart from the Blob it is handed (File.stream() / Blob.slice, available in the renderer and in Node 18+).
import { parseClock } from "./diurnal.js"; // the XYZ reader reads clock times as geosoft.js parseXYZ does

const DELIMS = [",", "\t", ";", "|"];

// split one line, honouring "quoted, fields" ("" inside quotes = a quote)
export function splitLine(line, d) {
  if (line.indexOf('"') < 0) return line.split(d);
  const out = []; let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === d) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

// The header and first rows of a table from the start of the file. Lines before the header that are comments ("/" or "#", as a
// Geosoft export writes) are skipped. -> { headers, delimiter, sample: [{ header: value }], headerLine, dataStart (char offset of the
// first data line), avgRowChars } ; null when no header with two or more columns is found.
export function sniffTable(text, { maxSample = 2000 } = {}) {
  const lines = String(text).split(/\r?\n/);
  let hi = 0;
  while (hi < lines.length && (/^\s*$/.test(lines[hi]) || /^\s*[\/#]/.test(lines[hi]))) hi++;
  const head = lines[hi];
  if (head == null) return null;
  const delimiter = DELIMS.map((d) => [d, splitLine(head, d).length]).sort((a, b) => b[1] - a[1])[0];
  if (delimiter[1] < 2) return null;
  const d = delimiter[0], headers = splitLine(head, d).map((h) => h.trim());
  let dataStart = 0;
  for (let i = 0; i <= hi; i++) dataStart += lines[i].length + 1;
  // the last line of the chunk may be cut: leave it out of the sample and the length estimate
  const body = lines.slice(hi + 1, -1).filter((l) => l.trim() && !/^\s*[\/#]/.test(l));
  const sample = body.slice(0, maxSample).map((l) => { const f = splitLine(l, d), r = {}; headers.forEach((h, j) => { r[h] = f[j] === undefined ? "" : f[j].trim(); }); return r; });
  const chars = body.reduce((a, l) => a + l.length + 1, 0);
  return { headers, delimiter: d, sample, headerLine: hi, dataStart, avgRowChars: body.length ? chars / body.length : NaN };
}

// rows about the file holds, from the sample's mean line length (bytes ~ chars for these ASCII files)
export const estimateRows = (fileBytes, sniff) => (sniff && sniff.avgRowChars > 0 ? Math.max(0, Math.round((fileBytes - sniff.dataStart) / sniff.avgRowChars)) : 0);

// Stream a Blob's rows. keep: the header names to keep (the others are not even split out of the kept lines' fields); every: keep data
// row 0, every, 2*every ... ; skipLines: header / comment lines before the data (sniffTable's headerLine + 1). Comment lines inside the
// data ("/", "#") and blank lines are not data rows. onProgress(fraction) about every 4 MB. signal: an AbortSignal.
// -> { rows: [{ name: number | string }], seen (data rows read), kept }
// A kept value is a NUMBER when the field is one, else a fresh copy of its text (interned: line names repeat): a substring of the
// chunk would keep the whole 4 MB chunk string alive, and a kept reading in every chunk then held the entire file's text (measured:
// a 2.7 GB heap peak reading Poplar's 1.37 GB CSV, freed only after the import).
const NUMERIC = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;
export async function streamTableRows(blob, { delimiter, headers, keep = headers, every = 1, skipLines = 1, onProgress = null, signal = null, chunkBytes = 4 << 20 } = {}) {
  const idx = keep.map((k) => headers.indexOf(k)).filter((i) => i >= 0), names = idx.map((i) => headers[i]);
  const maxIdx = idx.length ? Math.max(...idx) : -1;
  const decoder = new TextDecoder("utf-8");
  const rows = [], interned = new Map();
  const own = (v) => { if (v === "") return ""; if (NUMERIC.test(v)) return +v; let s = interned.get(v); if (s === undefined) { s = Array.from(v).join(""); if (interned.size < 100000) interned.set(s, s); } return s; };
  let seen = 0, lineNo = 0, rest = "", read = 0;
  const takeLine = (line) => {
    if (lineNo++ < skipLines) return;
    if (!line || line.charCodeAt(0) === 47 /* / */ || line.charCodeAt(0) === 35 /* # */ || !line.trim()) return;
    if (seen++ % every !== 0) return;
    let f;
    if (line.indexOf('"') >= 0) f = splitLine(line, delimiter);
    else { f = []; let start = 0; for (let j = 0; j <= maxIdx; j++) { const e = line.indexOf(delimiter, start); if (e < 0) { f.push(line.slice(start)); start = line.length + 1; for (j++; j <= maxIdx; j++) f.push(""); break; } f.push(line.slice(start, e)); start = e + 1; } }
    const r = {};
    for (let j = 0; j < idx.length; j++) { const v = f[idx[j]]; r[names[j]] = v === undefined ? "" : own(v.trim()); }
    rows.push(r);
  };
  for (let pos = 0; pos < blob.size; pos += chunkBytes) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const buf = await blob.slice(pos, Math.min(blob.size, pos + chunkBytes)).arrayBuffer();
    const text = rest + decoder.decode(buf, { stream: pos + chunkBytes < blob.size });
    let s = 0, e;
    while ((e = text.indexOf("\n", s)) >= 0) { takeLine(text.charCodeAt(e - 1) === 13 ? text.slice(s, e - 1) : text.slice(s, e)); s = e + 1; }
    rest = text.slice(s);
    read = Math.min(blob.size, pos + chunkBytes);
    onProgress?.(read / blob.size);
  }
  if (rest) takeLine(rest.endsWith("\r") ? rest.slice(0, -1) : rest);
  return { rows, seen, kept: rows.length };
}

// TASKS.csv #1351 — a Geosoft .xyz too big to read whole (Poplar 706 MB, Aeroquest 256 MB), streamed by the same rules as
// geosoft.js parseXYZ: "/" lines are headers / comments ("//" plain comments), "Line N" (or "Tie N") opens a flight line (kept as
// _line), data tokens split on white space, "*" = no value, a clock time ("16:51:55.20") = seconds of the day, else a float.
// columns: the header parseXYZ found on the file's first part; keep: the column names to keep (_line is always kept).
// -> { rows: [{ _line, column: number | null }], seen, kept }
export async function streamXyzRows(blob, { columns, keep = columns, every = 1, onProgress = null, signal = null, chunkBytes = 4 << 20 } = {}) {
  const idx = keep.map((k) => columns.indexOf(k)).filter((i) => i >= 0), names = idx.map((i) => columns[i]);
  const decoder = new TextDecoder("utf-8");
  const rows = [], lineNames = new Map();
  let seen = 0, current = null, rest = "";
  const takeLine = (raw) => {
    const t = raw.trim();
    if (!t || t.charCodeAt(0) === 47 /* / */) return;
    const lm = /^(Line|Tie)\s+(\S+)/i.exec(t);
    if (lm) { let n = lineNames.get(lm[2]); if (n === undefined) { n = Array.from(lm[2]).join(""); lineNames.set(n, n); } current = n; return; }
    if (seen++ % every !== 0) return;
    const toks = t.split(/\s+/), r = { _line: current };
    for (let j = 0; j < idx.length; j++) {
      const tok = toks[idx[j]];
      if (tok === undefined || tok === "*") { r[names[j]] = null; continue; }
      const v = tok.indexOf(":") >= 0 ? parseClock(tok) : parseFloat(tok);
      r[names[j]] = Number.isFinite(v) ? v : null;
    }
    rows.push(r);
  };
  for (let pos = 0; pos < blob.size; pos += chunkBytes) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const buf = await blob.slice(pos, Math.min(blob.size, pos + chunkBytes)).arrayBuffer();
    const text = rest + decoder.decode(buf, { stream: pos + chunkBytes < blob.size });
    let st = 0, e;
    while ((e = text.indexOf("\n", st)) >= 0) { takeLine(text.slice(st, e)); st = e + 1; }
    rest = text.slice(st);
    onProgress?.(Math.min(blob.size, pos + chunkBytes) / blob.size);
  }
  if (rest) takeLine(rest);
  return { rows, seen, kept: rows.length };
}

// the first part of a file, cut after its last complete line, for a header and a sample
export async function headText(blob, bytes = 512 * 1024) {
  const t = await blob.slice(0, Math.min(blob.size, bytes)).text();
  if (blob.size <= bytes) return t;
  const cut = t.lastIndexOf("\n");
  return cut > 0 ? t.slice(0, cut + 1) : t;
}
