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
export function parseTableText(text, { comments = "#", columnar = false } = {}) {
  // TASKS.csv #611 — a big table can be held as COLUMNS (see parseTableColumns); null = not eligible, read as rows
  if (columnar && text.length >= COLUMNAR_MIN_CHARS) { const c = parseTableColumns(text, { comments }); if (c) return c; }
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

// TASKS.csv #611 — large assay exports held as columns. parseTableText's rows are one object per row, and a 60 MB
// export (Lawyers q_ddh_assay: 83,670 rows x 109 columns) took 688 MB of heap that way and 4.6 s; the browser grew
// ~970 MB through a Geochem import, on the 8 GB laptops GeoStrix targets. Here every typed column is a
// Float64Array (plus a byte per row saying number / empty / other) and text columns are interned, so the same file
// is 56 MB and 1.5 s. Callers still get an array of ROWS: each row is a tiny object (its index) whose prototype has
// one getter per header, so r[header], map / filter / slice all behave as before, and the values are exactly what
// Papa's dynamicTyping gives (numbers, null for empty, true / false, Dates for ISO timestamps, text as is).
// Differences callers must respect: a row has no OWN keys (Object.keys / spread / JSON give nothing — use
// `headers`). Only used where the caller opts in (the Geochem assay import), and only when it is provably the same
// result: comma-delimited, no comma-decimal numbers, unique headers, every row the header's width. Anything else
// returns null and the normal reader runs.
const COLUMNAR_MIN_CHARS = 8_000_000;
const FLOAT = /^\s*-?(\d+\.?|\.\d+|\d+\.\d+)([eE][-+]?\d+)?\s*$/; // Papa 5's own dynamic-typing rules
const ISO_DATE = /^((\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d\.\d+([+-][0-2]\d:[0-5]\d|Z))|(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d([+-][0-2]\d:[0-5]\d|Z))|(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d([+-][0-2]\d:[0-5]\d|Z)))$/;
const MAX_FLOAT = 2 ** 53;
const IDX = Symbol("row");
const K_NUM = 0, K_NULL = 1, K_OTHER = 2;

export function parseTableColumns(text, { comments = "#" } = {}) {
  if (QUOTED_COMMA_NUMBER.test(text)) return null;
  let headers = null, typed = null, cols = null, n = 0, cap = 4096, bad = false, delimiter = null;
  const errors = [];
  const grow = () => {
    cap *= 2;
    cols.forEach((c) => {
      if (!c.num) return;
      const num = new Float64Array(cap); num.set(c.num); c.num = num;
      const kind = new Uint8Array(cap); kind.set(c.kind); c.kind = kind;
    });
  };
  const parser = Papa.parse(text, {
    header: false, dynamicTyping: false, skipEmptyLines: true, comments,
    step: (res, p) => {
      if (bad) return;
      if (res.errors?.length) errors.push(...res.errors);
      delimiter = delimiter || res.meta.delimiter;
      const a = res.data;
      if (!headers) {
        headers = a;
        if (delimiter !== "," || new Set(headers).size !== headers.length) { bad = true; p.abort(); return; }
        typed = headers.map((h) => !isIdentifierHeader(h));
        cols = typed.map((t) => (t ? { num: new Float64Array(cap), kind: new Uint8Array(cap), other: [], pool: new Map() } : { txt: [], pool: new Map() }));
        return;
      }
      if (a.length !== headers.length) { bad = true; p.abort(); return; }
      if (n === cap) grow();
      for (let j = 0; j < a.length; j++) {
        const v = a[j], c = cols[j];
        if (c.txt) { let s = c.pool.get(v); if (s === undefined) { s = v; c.pool.set(v, v); } c.txt.push(s); continue; }
        if (v === "") { c.kind[n] = K_NULL; continue; }
        if (FLOAT.test(v)) { const x = parseFloat(v); if (x > -MAX_FLOAT && x < MAX_FLOAT) { c.num[n] = x; c.kind[n] = K_NUM; continue; } }
        c.kind[n] = K_OTHER;
        // a text value in a typed column (an analysis-code column, "<0.005", "N/A"): kept in a per-column array
        // (holey where the column is mostly numbers), interned — 50 code columns x 83,670 rows were 250 MB in a Map
        if (v === "true" || v === "TRUE") c.other[n] = true;
        else if (v === "false" || v === "FALSE") c.other[n] = false;
        else if (ISO_DATE.test(v)) c.other[n] = new Date(v);
        else { let t = c.pool.get(v); if (t === undefined) { t = v; c.pool.set(v, v); } c.other[n] = t; }
      }
      n++;
    },
  });
  void parser;
  if (bad || !headers) return null;
  const proto = {};
  headers.forEach((h, j) => {
    const c = cols[j];
    const get = c.txt
      ? function () { return c.txt[this[IDX]]; }
      : function () { const i = this[IDX], k = c.kind[i]; return k === K_NUM ? c.num[i] : k === K_NULL ? null : c.other[i]; };
    Object.defineProperty(proto, h, { get, enumerable: true, configurable: false });
  });
  const rows = new Array(n);
  for (let i = 0; i < n; i++) { const r = Object.create(proto); r[IDX] = i; rows[i] = r; }
  cols.forEach((c) => { delete c.pool; });
  return { rows, headers, note: "", errors, columnar: true };
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
