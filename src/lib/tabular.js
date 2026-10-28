// TASKS.csv #444 — one CSV reader and one CSV writer for the whole app. Before this, six separate
// Papa.parse calls each had a different subset of the fixes: #284's comma-decimal handling lived only in
// the 3D View and Geochem importers (so a European-locale point survey or block model failed in
// Geophysics with a misleading "looked for x/y/z" message), and the Windows-1252 fallback for Excel exports
// lived only in the outcrop-structure importer. On the writing side, a hand-built `join(",")` corrupted any
// field containing a comma or quote. Pure (no DOM, no Electron): unit-tested in Node.
import Papa from "papaparse";
import { normalizeCommaDecimals } from "./numberLocale.js";
import { t as tr } from "./i18n.js"; // TASKS.csv #786 — messages in the interface language

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
const ID_WORD = /(hole|bhid|dhid|ddh|sample|samp_?id|samp_?no|collar_?id|drill_?id)/; // ddh / samp_no: #1071
const MEASURE_WORD = /(depth|length|len$|dip|azi|^az|_az|dia(m|meter)?$|size|from|to$|_to_|elev|east|north|recov|rqd|weight|wt|mass|count|interval|eoh|_m$|_ft$|grade|value)/;
export function isIdentifierHeader(h) {
  const k = String(h ?? "").trim().toLowerCase().replace(/[\s.\-/]+/g, "_");
  return ID_WORD.test(k) && !MEASURE_WORD.test(k);
}

// TASKS.csv #1071 (review #1016, drillhole-database admin) — the header words above miss many id columns ("DDH_No",
// "Collar", "Name", "Site_ID", "Lab_ID"...), and picking one as Hole ID in the mapping dialog could not bring "0045" back:
// it was 45 before the dialog opened, so collars ("DDH") and assays ("Hole_ID") no longer joined. So a column is also
// kept as text when its first rows hold a zero-padded integer ("0045"): no measurement is written that way. (Not "1E3":
// a lab can write a grade that way; an id column named by its header still keeps it.)
const ID_LIKE_VALUE = /^0\d+$/;
export function idLikeColumns(text, preview = 2000) {
  const out = new Set();
  const res = Papa.parse(text, { header: true, dynamicTyping: false, skipEmptyLines: true, comments: false, preview });
  for (const f of res.meta.fields || []) if (!isIdentifierHeader(f) && res.data.some((r) => ID_LIKE_VALUE.test(String(r[f] ?? "").trim()))) out.add(f);
  return out;
}

// TASKS.csv #720 — comment lines are skipped only at the TOP of the file, before the header: that is where GeoStrix's
// own export stamp goes (#404) and where other software puts its notes. Papa's `comments: "#"` dropped ANY line
// starting with "#", so hole / sample ids such as "#1" lost their rows with no count (1 of 3 rows read). Lines
// starting with "#" after the header are data when they have the header's width ("#1,0,10,A"); a shorter one (a
// note or stamp at the END of a file) cannot be a row and is skipped too.
export function stripLeadingComments(text, prefix = "#") {
  if (!prefix) return { text, skipped: 0 };
  let i = 0, skipped = 0;
  while (i < text.length) {
    let j = text.indexOf("\n", i);
    if (j < 0) j = text.length;
    const line = text.slice(i, j).replace(/\r$/, "");
    if (line.trim() === "") { i = j + 1; continue; }
    if (!line.trimStart().startsWith(prefix)) break;
    skipped++;
    i = j + 1;
  }
  let body = i ? text.slice(i) : text;
  if (body.includes(`\n${prefix}`)) { // later "#" lines: keep full-width ones (data), drop shorter ones (notes)
    const lines = body.split("\n");
    const header = lines[0].replace(/\r$/, "");
    const delim = [",", ";", "\t"].reduce((best, d) => (header.split(d).length > header.split(best).length ? d : best), ",");
    const width = header.split(delim).length;
    const kept = lines.filter((l, k) => k === 0 || !l.startsWith(prefix) || l.replace(/\r$/, "").split(delim).length >= width || ((skipped++), false));
    if (kept.length !== lines.length) body = kept.join("\n");
  }
  return { text: body, skipped };
}

// Text -> { rows, headers, note, errors }. Header row, typed values (identifier columns kept as text, #509),
// blank lines skipped, "#" lines before the header skipped (#404 / #720), comma decimals converted where provable
// (#284).
const QUOTED_COMMA_NUMBER = /"\s*[+-]?\d+(?:\.\d{3})*,\d+\s*"/;
const ID_LIKE_VALUE_IN = /(^|[,;\t"\n])\s*0\d+\s*("|[,;\t\r\n]|$)/; // #1071 — a cheap test of the whole text
export function parseTableText(text, { comments = "#", columnar = false } = {}) {
  ({ text } = stripLeadingComments(text, comments)); // #720
  // TASKS.csv #611 — a big table can be held as COLUMNS (see parseTableColumns); null = not eligible, read as rows
  if (columnar && text.length >= COLUMNAR_MIN_CHARS) { const c = parseTableColumns(text, { comments: false }); if (c) return c; }
  // #600 (performance) — Papa asks once per CELL; the answer depends only on the header, so cache it per header.
  const typed = new Map();
  const idLike = ID_LIKE_VALUE_IN.test(text) ? idLikeColumns(text) : null; // #1071 — only scanned when such a value exists
  const dynamicTyping = (field) => { let v = typed.get(field); if (v === undefined) { v = !isIdentifierHeader(field) && !idLike?.has(field); typed.set(field, v); } return v; };
  const res = Papa.parse(text, { header: true, dynamicTyping, skipEmptyLines: true, comments: false });
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
export const COLUMNAR_MIN_CHARS = 8_000_000; // exported for tabular.worker.js (#583)
const FLOAT = /^\s*-?(\d+\.?|\.\d+|\d+\.\d+)([eE][-+]?\d+)?\s*$/; // Papa 5's own dynamic-typing rules
const ISO_DATE = /^((\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d\.\d+([+-][0-2]\d:[0-5]\d|Z))|(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d([+-][0-2]\d:[0-5]\d|Z))|(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d([+-][0-2]\d:[0-5]\d|Z)))$/;
const MAX_FLOAT = 2 ** 53;
const IDX = Symbol("row");
const K_NUM = 0, K_NULL = 1, K_OTHER = 2;

export function parseTableColumns(text, opts) {
  const raw = parseColumnsRaw(text, opts);
  return raw ? rowsFromColumns(raw) : null;
}

// TASKS.csv #583 — the two halves of parseTableColumns, split so the parse can run in a worker (tabular.worker.js):
// parseColumnsRaw -> { headers, cols, n, errors } is plain data (typed arrays transferable, text arrays cloneable);
// rowsFromColumns wraps it as the accessor rows on the thread that uses them (getters can't be posted).
export function parseColumnsRaw(text, { comments = "#" } = {}) {
  ({ text } = stripLeadingComments(text, comments)); // #720 — only before the header
  if (QUOTED_COMMA_NUMBER.test(text)) return null;
  const idLike = ID_LIKE_VALUE_IN.test(text) ? idLikeColumns(text) : null; // #1071
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
    header: false, dynamicTyping: false, skipEmptyLines: true, comments: false,
    step: (res, p) => {
      if (bad) return;
      if (res.errors?.length) errors.push(...res.errors);
      delimiter = delimiter || res.meta.delimiter;
      const a = res.data;
      if (!headers) {
        headers = a;
        if (delimiter !== "," || new Set(headers).size !== headers.length) { bad = true; p.abort(); return; }
        typed = headers.map((h) => !isIdentifierHeader(h) && !idLike?.has(h));
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
  cols.forEach((c) => { delete c.pool; });
  return { headers, cols, n, errors };
}
export function rowsFromColumns({ headers, cols, n, errors }) {
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
  return { rows, headers, note: "", errors, columnar: true };
}

// A File/Blob (browser or Electron renderer) -> the same, plus a note when the encoding fallback was used.
// TASKS.csv #583 — a file of WORKER_MIN_BYTES or more is decoded and parsed in tabular.worker.js: a 14.7 MB /
// 190,000-row assay export froze the window for 2.6 s here (2.05 s of it the parse). Same result either way; if a
// worker can't start, the file is read on this thread as before.
const WORKER_MIN_BYTES = 2_000_000;
const encodingNote = (out, encoding) => {
  if (encoding !== "utf-8") out.note = tr("{v}Read as Windows-1252 (the file is not UTF-8 — typical of an Excel export).", { v: out.note ? `${out.note} ` : "" }).trim();
  return { ...out, encoding };
};
function parseInWorker(buf, opts) {
  return new Promise((resolve, reject) => {
    let worker;
    try { worker = new Worker(new URL("./tabular.worker.js", import.meta.url), { type: "module" }); } catch (err) { reject(err); return; }
    worker.onmessage = (e) => {
      worker.terminate();
      const d = e.data || {};
      if (d.type === "columns") resolve(encodingNote(rowsFromColumns(d.raw), d.encoding));
      else if (d.type === "rows") resolve(encodingNote(d.out, d.encoding));
      else reject(new Error(d.message || tr("The file reader stopped.")));
    };
    worker.onerror = (e) => { e.preventDefault?.(); worker.terminate(); reject(new Error(e.message || tr("worker failed"))); };
    worker.postMessage({ buf, opts }, [buf]);
  });
}
export async function parseTableFile(file, opts) {
  if (typeof Worker !== "undefined" && file.size >= WORKER_MIN_BYTES) {
    try { return await parseInWorker(await file.arrayBuffer(), opts || {}); } catch { /* read here instead */ }
  }
  const { text, encoding } = decodeTableBytes(await file.arrayBuffer());
  return encodingNote(parseTableText(text, opts), encoding);
}

// Rows (objects, or { fields, data }) -> CSV text with correct quoting (commas, quotes, newlines).
export const toCsv = (rows, opts) => Papa.unparse(rows, opts);

// TASKS.csv #1022 / #1016 (review: exploration geologist, security) — every CSV a user EXPORTS goes through this:
// (1) the header is the union of all rows' keys, in first-seen order. Papa.unparse takes it from the first row only, so
//     a report mixing row kinds (Surface QA/QC: batch rows, then the failed standards / blanks / duplicates) lost every
//     column the first row lacked.
// (2) a text cell that Excel would run as a formula (=, @, a tab / CR, or + / - not followed by a digit) is written with
//     a leading apostrophe; numbers and negative numbers are untouched (CSV / formula injection).
export const FORMULA_LEAD = /^[=@\t\r]|^[+-](?![\d.])/;
export function toExportCsv(rows, opts = {}) {
  if (!Array.isArray(rows)) return Papa.unparse(rows, { escapeFormulae: FORMULA_LEAD, ...opts });
  const fields = [], seen = new Set();
  for (const r of rows) for (const k of Object.keys(r || {})) if (!seen.has(k)) { seen.add(k); fields.push(k); }
  return Papa.unparse({ fields, data: rows.map((r) => fields.map((k) => r?.[k] ?? "")) }, { escapeFormulae: FORMULA_LEAD, ...opts });
}
