// TASKS.csv #444 — one CSV reader and one CSV writer for the whole app. Before this, six separate
// Papa.parse calls each had a different subset of the fixes: #284's comma-decimal handling lived only in
// the 3D View and Geochem importers (so a European-locale point survey or block model failed in
// Geophysics with a misleading "looked for x/y/z" message), and the Windows-1252 fallback for Excel exports
// lived only in the outcrop-structure importer. On the writing side, a hand-built `join(",")` corrupted any
// field containing a comma or quote. Pure (no DOM, no Electron): unit-tested in Node.
import Papa from "papaparse";
import { requestTableSubset as requestTableSubsetEv } from "./tableSubsetRequest.js"; // TASKS.csv #2177
import { makeCompositor } from "./compositeOnRead.js"; // TASKS.csv #2345
import { makeLogReader } from "./logOnRead.js"; // TASKS.csv #3038
import { normalizeCommaDecimals } from "./numberLocale.js";
import { t as tr } from "./i18n.js"; // TASKS.csv #786 — messages in the interface language
import { arrMax } from "./arrayStats.js"; // TASKS.csv #3031

// Bytes -> text. UTF-8 first (BOM stripped); if that produced replacement characters, the file was not
// UTF-8 — almost always an Excel export on Windows (Windows-1252: degree signs, accented names).
// TASKS.csv #2344 — one string holds at most 0x1fffffe8 characters (V8): a CSV over about 512 MB cannot be decoded in one piece. A 599 MB
// table was read as "" in the app (Chromium's decoder gave an empty string) and the import said "no rows found". Over this size the read
// stops at once with the real reason; reading such a file in chunks is its own row.
export const TEXT_MAX_BYTES = 0x1fffffe8;
const tooLargeForOneRead = (bytes) => new Error(bytes != null ? tr("it is {mb} MB, more than the 512 MB a single text read can hold, so it can't be opened in one piece: split it (by hole, or by columns) and open the parts", { mb: Math.round(bytes / 1048576).toLocaleString() }) : tr("it could not be read as text in one piece (too large for one read): split it (by hole, or by columns) and open the parts"));
export function decodeTableBytes(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (u8.length > TEXT_MAX_BYTES) throw tooLargeForOneRead(u8.length); // #2344
  let text;
  try { text = new TextDecoder("utf-8").decode(u8); } catch { throw tooLargeForOneRead(null); } // #2344 — a string-length failure
  if (u8.length > 0 && !text.length) throw tooLargeForOneRead(null); // #2344 — the empty decode seen in the app
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

// TASKS.csv #1666 (review #1646, Kodiak) — a contractor CSV with a block of notes above the header (SJ Geophysics' station file: 23 lines of
// 'Client: Kodiak Copper', 'Datum/Projection/Zone: ...', then 'Line,Series,Station,Easting,Northing,Elevation,Type') was read as ONE
// column headed 'Client: Kodiak Copper', in Point survey and Terrain from points alike. The table starts at the first line of three or
// more delimited fields, wider than the first line, that the next lines share; the notes above it are skipped and counted.
// Only looked at when the first line is narrower than 3 fields, so an ordinary table never changes. -> { text, skipped }
export function skipPreamble(text, maxLines = 300) {
  const head = text.slice(0, 200_000).split("\n").slice(0, maxLines).map((l) => l.replace(/\r$/, ""));
  const first = head.findIndex((l) => l.trim() !== "");
  if (first < 0) return { text, skipped: 0 };
  if ((head[first].split('"').length - 1) % 2) return { text, skipped: 0 }; // a quoted header cell running over several lines: leave it to the CSV reader
  const delim = [",", ";", "\t"].reduce((best, d) => (head.slice(first, first + 60).join("\n").split(d).length > head.slice(first, first + 60).join("\n").split(best).length ? d : best), ",");
  const width = (l) => { let n = 1, q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === delim && !q) n++; } return n; }; // a delimiter inside quotes ("1,5") is not a field break
  // TASKS.csv #1665 (review #1646, Kodiak) — a two-row header: a banner of group names over the field names (Appendix A: '', 'Lithology', '', ...,
  // 'Alteration', ... then 'Hole Number', 'From (m)' ...) mapped as 'Column 1 / Lithology / Column 3'. The banner is mostly empty cells; the
  // row under it is as wide and fully labelled with text: the header is that row.
  if (width(head[first]) >= 3) {
    const cells = (l) => { const out = []; let cur = "", q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === delim && !q) { out.push(cur); cur = ""; } else cur += ch; } out.push(cur); return out.map((c) => c.trim()); };
    const a = cells(head[first]), nxt = head.findIndex((l, k) => k > first && l.trim() !== ""), b = nxt > 0 ? cells(head[nxt]) : [];
    const filled = (cs) => cs.filter((c) => c !== "").length, texty = (cs) => cs.filter((c) => c !== "" && !Number.isFinite(Number(c))).length;
    if (b.length === a.length && filled(a) <= 0.5 * a.length && filled(a) >= 1 && texty(b) >= 0.8 * b.length) {
      const lines = text.split("\n");
      return { text: lines.slice(nxt).join("\n"), skipped: 1, banner: true };
    }
    return { text, skipped: 0 };
  }
  for (let h = first + 1; h < head.length; h++) {
    const w = width(head[h]);
    if (w < 3 || w <= width(head[first])) continue;
    const next = head.slice(h + 1).filter((l) => l.trim() !== "").slice(0, 3);
    // TASKS.csv #2828 (GSC geophysics review, 2026-11-12) — the Geological Survey of Canada's station downloads (a Geosoft export) end every DATA row with
    // the delimiter and the header row without it: 22 names over rows of 23 fields, the last one empty. The header was passed over for
    // not matching, and the first station row (23 fields, like the rows under it) became the column names. Rows one field wider than
    // the header, that field empty, are its rows.
    const trailing = (l) => width(l) === w + 1 && l.trimEnd().endsWith(delim);
    if (next.length && (next.every((l) => width(l) === w) || next.every(trailing))) {
      const lines = text.split("\n");
      return { text: lines.slice(h).join("\n"), skipped: head.slice(0, h).filter((l) => l.trim() !== "").length };
    }
  }
  return { text, skipped: 0 };
}

// Text -> { rows, headers, note, errors }. Header row, typed values (identifier columns kept as text, #509),
// blank lines skipped, "#" lines before the header skipped (#404 / #720), comma decimals converted where provable
// (#284).
const QUOTED_COMMA_NUMBER = /"\s*[+-]?\d+(?:\.\d{3})*,\d+\s*"/;
const ID_LIKE_VALUE_IN = /(^|[,;\t"\n])\s*0\d+\s*("|[,;\t\r\n]|$)/; // #1071 — a cheap test of the whole text
// TASKS.csv #2017 (review #2013, Import) — a whitespace-aligned table (a contractor's n = 1 IP file, a Geosoft-style .dat export:
// 'LINE STN GRID_X GRID_Y MX RHO') came in as ONE column, so no picker could map it. When the header has no comma, semicolon or tab
// and splits into 3+ fields on runs of spaces, and most of the next lines split into the same number, the table is re-joined with
// tabs. A quoted field (a name with spaces) is never guessed at.
export function spaceTableToTabs(text) {
  // decided on the first 200 kB, so a big comma file is not split into lines for nothing (performance first)
  const lines = text.slice(0, 200_000).split(/\r?\n/);
  const first = lines.findIndex((l) => l.trim());
  if (first < 0) return null;
  const head = lines[first];
  if (/[,;\t"]/.test(head)) return null;
  const width = head.trim().split(/\s+/).length;
  if (width < 3) return null;
  const sample = lines.slice(first + 1).filter((l) => l.trim()).slice(0, 50);
  if (!sample.length || sample.some((l) => /[,;\t"]/.test(l))) return null;
  const same = sample.filter((l) => l.trim().split(/\s+/).length === width).length;
  if (same < 0.8 * sample.length) return null;
  return text.split(/\r?\n/).map((l) => (l.trim() ? l.trim().split(/\s+/).join("\t") : "")).join("\n");
}
// keep (TASKS.csv #2177): the header names to read; every other column is never held (a table over the memory budget, its columns chosen)
// holes (TASKS.csv #2321): { col, ids } — only the rows whose `col` (trimmed) is one of `ids` are kept, applied as each row is read
// composite (TASKS.csv #2345): { hole, from, to, lengthM } — the kept rows composited to that length as they are read (never all held)
// logRead (TASKS.csv #3038): { hole, depth | from + to, channels, sampleN } — a downhole log read into typed columns (logOnRead.js) as it is
// read: the rows returned are its first sampleN rows, and `logTable` holds every reading
export function parseTableText(text, { comments = "#", columnar = false, keep = null, holes = null, composite = null, logRead = null } = {}) {
  ({ text } = stripLeadingComments(text, comments)); // #720
  const spaced = spaceTableToTabs(text); // #2017
  if (spaced != null) text = spaced;
  let preamble = 0, banner = false;
  ({ text, skipped: preamble, banner } = skipPreamble(text)); // #1666; banner: #1665
  // TASKS.csv #611 — a big table can be held as COLUMNS (see parseTableColumns); null = not eligible, read as rows
  if (columnar && !composite && !logRead && text.length >= COLUMNAR_MIN_CHARS) { const c = parseTableColumns(text, { comments: false, keep, holes }); if (c) return c; }
  // #600 (performance) — Papa asks once per CELL; the answer depends only on the header, so cache it per header.
  const typed = new Map();
  const idLike = ID_LIKE_VALUE_IN.test(text) ? idLikeColumns(text) : null; // #1071 — only scanned when such a value exists
  const dynamicTyping = (field) => { let v = typed.get(field); if (v === undefined) { v = !isIdentifierHeader(field) && !idLike?.has(field); typed.set(field, v); } return v; };
  let res, droppedByHole = 0;
  const hf = holes?.col && holes.ids ? { col: holes.col, ids: new Set([...holes.ids].map((v) => String(v).trim())) } : null; // #2321
  let composited = null, logTable = null;
  if (keep?.length || hf || composite || logRead) { // #2177 — row by row, each row cut to the kept columns at once, so the dropped ones never accumulate; #2321 — other holes' rows too
    const want = keep?.length ? new Set([...keep, ...(composite ? [composite.hole, composite.from, composite.to] : [])]) : null, data = [], errors = []; // #2345 — the composite's own columns are always read
    const comp = composite ? makeCompositor(composite) : null; // #2345 — each kept row goes into its hole's bins instead of the row list
    const lr = logRead ? makeLogReader(logRead) : null; // #3038 — each row into the log's typed columns
    let fields = null, kept = null;
    const meta = Papa.parse(text, { header: true, dynamicTyping, skipEmptyLines: true, comments: false, step: (r) => {
      if (!kept) { fields = r.meta.fields || []; kept = want ? fields.filter((f) => want.has(f)) : fields; }
      if (r.errors?.length) errors.push(...r.errors);
      if (hf && !hf.ids.has(String(r.data[hf.col] ?? "").trim())) { droppedByHole++; return; }
      const o = {}; for (const f of kept) o[f] = r.data[f];
      if (lr) lr.add(o); else if (comp) comp.add(o); else data.push(o);
    } }).meta;
    let out = data;
    if (comp) { const f = comp.finish(); out = f.rows; composited = f.stats; }
    if (lr) { const f = lr.finish(); out = f.sample; logTable = f.table; } // #3038 // #2345 — never push(...rows): 150,000 composites overflowed the stack
    res = { data: out, errors, meta: { ...meta, fields: kept || (meta.fields || []).filter((f) => !want || want.has(f)) } };
    void fields;
  } else res = Papa.parse(text, { header: true, dynamicTyping, skipEmptyLines: true, comments: false });
  // TASKS.csv #600 (40958Z, performance) — in a COMMA-delimited file a comma-decimal value can only exist quoted
  // ("1,5"), so when the raw text has no quoted comma number the column-by-column scan (every row x column:
  // 1.4 s of a 4.4 s parse on an 83,670 x 109 assay export) is skipped. Semicolon / tab files are scanned as before.
  const commaFree = res.meta.delimiter === "," && !QUOTED_COMMA_NUMBER.test(text);
  const { rows, note } = commaFree ? { rows: res.data, note: "" } : normalizeCommaDecimals(res.data);
  const pre = banner ? tr("The first row was a banner of group names over the field names: the second row is used as the header.") : preamble ? tr("Skipped {n} line(s) of notes above the header row.", { n: preamble }) : ""; // #1666; #1665
  const sp = spaced != null ? tr("Read as a space-separated table ({n} columns).", { n: (res.meta.fields || []).length }) : ""; // #2017
  return { rows, headers: res.meta.fields || [], note: [note, pre, sp].filter(Boolean).join(" "), errors: res.errors || [], ...(hf ? { droppedByHole } : {}), ...(composited ? { composited } : {}), ...(logTable ? { logTable } : {}) };
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
export function parseColumnsRaw(text, { comments = "#", keep = null, holes = null } = {}) { // keep: #2177; holes: #2321
  ({ text } = stripLeadingComments(text, comments)); // #720 — only before the header
  ({ text } = skipPreamble(text)); // #1666
  if (QUOTED_COMMA_NUMBER.test(text)) return null;
  const idLike = ID_LIKE_VALUE_IN.test(text) ? idLikeColumns(text) : null; // #1071
  let headers = null, typed = null, cols = null, n = 0, cap = 4096, bad = false, delimiter = null, width = 0, idx = null, holeJ = -1, droppedByHole = 0;
  const errors = [], holeIds = holes?.col && holes.ids ? new Set([...holes.ids].map((v) => String(v).trim())) : null; // #2321
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
        headers = a; width = a.length;
        if (delimiter !== "," || new Set(headers).size !== headers.length) { bad = true; p.abort(); return; }
        idx = headers.map((_, j) => j);
        if (holeIds) { holeJ = headers.indexOf(holes.col); if (holeJ < 0) { bad = true; p.abort(); return; } } // #2321 — no such column: the row reader says so
        if (keep?.length) { const want = new Set(keep); idx = idx.filter((j) => want.has(headers[j])); headers = idx.map((j) => headers[j]); } // #2177
        typed = headers.map((h) => !isIdentifierHeader(h) && !idLike?.has(h));
        cols = typed.map((t) => (t ? { num: new Float64Array(cap), kind: new Uint8Array(cap), other: [], pool: new Map() } : { txt: [], pool: new Map() }));
        return;
      }
      if (a.length !== width) { bad = true; p.abort(); return; }
      if (holeIds && !holeIds.has(String(a[holeJ] ?? "").trim())) { droppedByHole++; return; } // #2321 — another hole's row is never held
      if (n === cap) grow();
      for (let q = 0; q < idx.length; q++) {
        const v = a[idx[q]], c = cols[q];
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
  return { headers, cols, n, errors, ...(holeIds ? { droppedByHole } : {}) };
}
export function rowsFromColumns({ headers, cols, n, errors, droppedByHole }) {
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
  return { rows, headers, note: "", errors, columnar: true, ...(droppedByHole != null ? { droppedByHole } : {}) };
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
    const parts = []; // #2175 — rows sent in parts (tabular.worker.js)
    worker.onmessage = (e) => {
      const d = e.data || {};
      if (d.type === "rows-part") { parts.push(d.rows); return; }
      worker.terminate();
      if (d.type === "columns") resolve(encodingNote(rowsFromColumns(d.raw), d.encoding));
      else if (d.type === "rows") resolve(encodingNote(d.out.rows ? d.out : { ...d.out, rows: [].concat(...parts) }, d.encoding));
      else reject(new Error(d.message || tr("The file reader stopped.")));
    };
    worker.onerror = (e) => { e.preventDefault?.(); worker.terminate(); reject(new Error(e.message || tr("worker failed"))); };
    worker.postMessage({ buf, opts }, [buf]);
  });
}
// TASKS.csv #2171 (WA review #2148) — a 380 MB assay table (3.1 M rows x 85 columns) never reached its dialog: 6.5 GB working set, then
// every GeoStrix process exited. Read as columns, each cell costs about 9 bytes (a Float64 and a kind byte, arrays grown by doubling)
// on top of the file buffer and its UTF-16 text, so that table needed some 4-5 GB before anything was drawn. Before parsing, the
// rows x columns are estimated from the first 1 MB and a table needing more than TABLE_MEMORY_BUDGET is not opened unasked.
export const TABLE_MEMORY_BUDGET = 2e9;
export async function estimateTableMemory(file) {
  const head = await file.slice(0, 1 << 20).text();
  const lines = head.split(/\r?\n/);
  if (file.size > head.length && lines.length > 1) lines.pop(); // a cut last line
  const header = lines[0] || "";
  const delim = [",", "\t", ";", "|"].reduce((a, d) => (header.split(d).length > header.split(a).length ? d : a), ",");
  const cols = Math.max(1, header.split(delim).length);
  const dataLines = Math.max(1, lines.length - 1);
  const used = lines.reduce((n, l) => n + l.length + 1, 0);
  const rows = Math.round(Math.max(0, file.size - (header.length + 1)) / Math.max(1, (used - header.length - 1) / dataLines));
  return { rows, cols, bytes: rows * cols * 9 * 1.5 + file.size * 3 };
}
// TASKS.csv #2177 (Matt's decision 2026-11-09) — over the budget, the columns are chosen BEFORE the full read, so every kept value stays
// exact: the estimate per column count, and the header names from the first 1 MB. -> { rows, cols, headers, fixed, perColumn }
export async function tableColumnsPreview(file) {
  const e = await estimateTableMemory(file);
  const head = await file.slice(0, 1 << 16).text();
  const first = (head.split(/\r?\n/)[0] || "").replace(/^\uFEFF/, "");
  const delim = [",", "\t", ";", "|"].reduce((a, d) => (first.split(d).length > first.split(a).length ? d : a), ",");
  const headers = first.split(delim).map((h) => h.trim().replace(/^"(.*)"$/, "$1"));
  // #2321 — the first rows' cells from the first 1 MB (a naive split: only for estimating what share of the rows a holes subset keeps; the
  // header's 64 KB held 153 rows of a 62-column table, live)
  const body = file.size > head.length ? await file.slice(0, 1 << 20).text() : head;
  const sample = body.split(/\r?\n/).slice(1, -1).filter((l) => l.trim()).slice(0, 5000).map((l) => l.split(delim).map((v) => v.trim().replace(/^"(.*)"$/, "$1")));
  return { ...e, headers, sample, fixed: file.size * 3, perColumn: e.rows * 9 * 1.5 };
}
export { subsetBytes } from "./tableSubsetRequest.js"; // #2177
const requestTableSubset = (file, preview) => requestTableSubsetEv(file, preview, TABLE_MEMORY_BUDGET);
// -> true to go on (whole table), { keep: [header...] } (only those columns), or false. confirm: injectable (tests); with no window (Node)
// the table is read.
export async function confirmTableSize(file, { budget = TABLE_MEMORY_BUDGET, confirm = typeof window !== "undefined" ? (m) => window.confirm(m) : null, choose = requestTableSubset } = {}) {
  if (!confirm || !(file?.size > budget / 12)) return true; // a file under budget / 12 can never reach the budget
  const e = await estimateTableMemory(file);
  if (e.bytes <= budget) return true;
  const chosen = choose ? await choose(file, await tableColumnsPreview(file)) : null; // #2177
  if (chosen != null) return chosen;
  return confirm(tr("{name} is a very large table: about {rows} rows × {cols} columns. Opening it needs roughly {gb} GB of memory, which can close GeoStrix on this computer.", { name: file.name, rows: e.rows.toLocaleString(), cols: e.cols, gb: (e.bytes / 1e9).toFixed(1) })
    + "\n\n" + tr("OK — open it anyway.") + "\n" + tr("Cancel — don't open it (split the file, or keep only the rows and columns you need, and open the parts)."));
}
// TASKS.csv #2346 (split from #2344) — a CSV over TEXT_MAX_BYTES read in PARTS: no single string holds it. chunks: an async iterable of
// Uint8Array pieces of the file, in order. The encoding is decided on the first ENCODING_PROBE bytes (UTF-8 unless they hold a byte
// sequence UTF-8 can't read: then Windows-1252, said in the note). The text is cut only at a line end outside quotes, and each part is
// parsed with the header line in front of it, so typing, the kept columns (#2177), the holes subset (#2321) and the composite (#2345)
// behave as in parseTableText. The whole-text steps work on the head: leading comments and a preamble / banner (above the header), the
// space-separated test (#2017, then every line re-joined), the id-like column scan (#1071, its first 2,000 lines as before); comma
// decimals are looked for in every part. -> parseTableText's { rows, headers, note, errors, droppedByHole?, composited? } + { encoding, parts }
const ENCODING_PROBE = 16 << 20, FIRST_PART_MIN = 256 << 10;
export async function parseTableChunks(chunks, { comments = "#", keep = null, holes = null, composite = null, logRead = null } = {}) { // logRead: #3038
  const it = chunks[Symbol.asyncIterator] ? chunks[Symbol.asyncIterator]() : chunks[Symbol.iterator]();
  const headBufs = []; let headLen = 0, done = false;
  while (headLen < ENCODING_PROBE) { const r = await it.next(); if (r.done) { done = true; break; } headBufs.push(r.value); headLen += r.value.length; }
  const probe = new TextDecoder("utf-8").decode(concatBytes(headBufs, Math.min(headLen, ENCODING_PROBE)), { stream: true });
  const encoding = probe.includes("�") ? "windows-1252" : "utf-8";
  const dec = new TextDecoder(encoding);
  const want = keep?.length ? new Set([...keep, ...(composite ? [composite.hole, composite.from, composite.to] : [])]) : null;
  const hf = holes?.col && holes.ids ? { col: holes.col, ids: new Set([...holes.ids].map((v) => String(v).trim())) } : null;
  const comp = composite ? makeCompositor(composite) : null;
  const lr = logRead ? makeLogReader(logRead) : null; // #3038
  const data = [], errors = [];
  let kept = null, droppedByHole = 0, headerLine = null, newline = "\n", delimiter, spaced = false, preamble = 0, banner = false, typedBy = null, commaSeen = false, parts = 0;
  const step = (r) => {
    if (!kept) kept = want ? (r.meta.fields || []).filter((f) => want.has(f)) : (r.meta.fields || []);
    if (r.errors?.length) errors.push(...r.errors);
    if (hf && !hf.ids.has(String(r.data[hf.col] ?? "").trim())) { droppedByHole++; return; }
    const o = {}; for (const f of kept) o[f] = r.data[f];
    if (lr) lr.add(o); else if (comp) comp.add(o); else data.push(o);
  };
  const parsePart = (text) => {
    parts++;
    if (!headerLine) { // the first part: comments, BOM, space-separated, preamble, the header, the id-like columns
      if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
      ({ text } = stripLeadingComments(text, comments));
      const sp = spaceTableToTabs(text); if (sp != null) { text = sp; spaced = true; }
      ({ text, skipped: preamble, banner } = skipPreamble(text));
      const nl = text.indexOf("\n");
      headerLine = (nl < 0 ? text : text.slice(0, nl)).replace(/\r$/, "");
      if (nl > 0 && text[nl - 1] === "\r") newline = "\r\n"; // the file's own line end: the header is joined to every later part with it
      const idLike = ID_LIKE_VALUE_IN.test(text) ? idLikeColumns(text) : null;
      const typed = new Map();
      typedBy = (field) => { let v = typed.get(field); if (v === undefined) { v = !isIdentifierHeader(field) && !idLike?.has(field); typed.set(field, v); } return v; };
    } else {
      if (spaced) text = text.split(/\r?\n/).map((l) => (l.trim() ? l.trim().split(/\s+/).join("\t") : "")).join("\n"); // spaceTableToTabs joins with \n too
      text = `${headerLine}${spaced ? "\n" : newline}${text}`;
      if (comments && text.includes(`\n${comments}`)) ({ text } = stripLeadingComments(text, comments)); // a short "#" note line later on (#720)
    }
    if (!commaSeen && QUOTED_COMMA_NUMBER.test(text)) commaSeen = true;
    const meta = Papa.parse(text, { header: true, dynamicTyping: typedBy, skipEmptyLines: true, comments: false, ...(delimiter ? { delimiter, newline: spaced ? "\n" : newline } : {}), step }).meta;
    delimiter = delimiter || meta.delimiter;
  };
  // cut at the last line end outside quotes ("" inside a quoted cell toggles twice: the parity stays right)
  let carry = "";
  const feed = (str, last) => {
    let buf = carry + str;
    if (last) { carry = ""; if (buf.trim()) parsePart(buf); return; }
    if (!headerLine && buf.length < FIRST_PART_MIN) { carry = buf; return; } // the head's checks (comments, preamble, spaced) read its first 200 kB
    let q = false, cut = -1;
    for (let i = 0; i < buf.length; i++) { const c = buf.charCodeAt(i); if (c === 34) q = !q; else if (c === 10 && !q) cut = i; }
    if (cut < 0) { carry = buf; return; }
    carry = buf.slice(cut + 1); buf = buf.slice(0, cut + 1);
    if (buf.trim()) parsePart(buf);
  };
  for (const b of headBufs) feed(dec.decode(b, { stream: true }), false);
  headBufs.length = 0;
  while (!done) { const r = await it.next(); if (r.done) break; feed(dec.decode(r.value, { stream: true }), false); }
  feed(dec.decode(), true);
  let rows = data;
  let composited = null, logTable = null;
  if (comp) { const f = comp.finish(); rows = f.rows; composited = f.stats; }
  if (lr) { const f = lr.finish(); rows = f.sample; logTable = f.table; } // #3038
  let cnote = "";
  if (delimiter !== "," || commaSeen) ({ rows, note: cnote } = normalizeCommaDecimals(rows)); // #600 — only where a comma decimal can exist
  const pre = banner ? tr("The first row was a banner of group names over the field names: the second row is used as the header.") : preamble ? tr("Skipped {n} line(s) of notes above the header row.", { n: preamble }) : "";
  const headers = kept || [];
  const sp = spaced ? tr("Read as a space-separated table ({n} columns).", { n: headers.length }) : "";
  const enc = encoding !== "utf-8" ? tr("Its first {mb} MB were not UTF-8, so the whole file was read as Windows-1252.", { mb: Math.round(Math.min(headLen, ENCODING_PROBE) / 1048576) }) : "";
  return { rows, headers, note: [cnote, pre, sp, enc].filter(Boolean).join(" "), errors, encoding, parts, ...(hf ? { droppedByHole } : {}), ...(composited ? { composited } : {}), ...(logTable ? { logTable } : {}) };
}
function concatBytes(bufs, n) {
  const out = new Uint8Array(n); let o = 0;
  for (const b of bufs) { if (o >= n) break; const k = Math.min(b.length, n - o); out.set(b.subarray(0, k), o); o += k; }
  return out;
}
// a File / Blob as an async iterable of byte pieces (file.slice: only one piece held at a time)
export async function* fileChunks(file, size = 32 << 20) {
  for (let at = 0; at < file.size; at += size) yield new Uint8Array(await file.slice(at, Math.min(file.size, at + size)).arrayBuffer());
}
function parseFileChunksInWorker(file, opts) {
  return new Promise((resolve, reject) => {
    let worker;
    try { worker = new Worker(new URL("./tabular.worker.js", import.meta.url), { type: "module" }); } catch (err) { reject(err); return; }
    const parts = [];
    worker.onmessage = (e) => {
      const d = e.data || {};
      if (d.type === "rows-part") { parts.push(d.rows); return; }
      worker.terminate();
      if (d.type === "rows") resolve(d.out.rows ? d.out : { ...d.out, rows: [].concat(...parts) });
      else reject(new Error(d.message || tr("The file reader stopped.")));
    };
    worker.onerror = (e) => { e.preventDefault?.(); worker.terminate(); reject(new Error(e.message || tr("worker failed"))); };
    worker.postMessage({ file, opts: { ...opts, chunked: true } });
  });
}

// #2171 — a worker that failed on a big file (out of memory) is not retried on the window's own thread: that took the whole app down
const MAIN_THREAD_RETRY_MAX = 64e6;
export async function parseTableFile(file, opts) {
  // #2344 / #2346 — over 512 MB the text can't be one string: read in parts in a worker (below), after the column chooser as any big table
  const inParts = file?.size > TEXT_MAX_BYTES;
  if (inParts && typeof Worker === "undefined") throw tooLargeForOneRead(file.size);
  if (!(opts?.sizeChecked)) {
    const ok = await confirmTableSize(file);
    if (!ok) throw new Error(tr("not opened: it needs more memory than this computer can safely give it"));
    if (ok.keep?.length) opts = { ...(opts || {}), keep: ok.keep }; // #2177 — only the chosen columns are read
    if (ok.holes?.col && ok.holes.ids?.length) opts = { ...(opts || {}), holes: { col: ok.holes.col, ids: [...ok.holes.ids], label: ok.holes.label || "" } }; // #2321 — only those holes' rows
    if (ok.composite?.lengthM > 0 && ok.composite.hole && ok.composite.from && ok.composite.to) opts = { ...(opts || {}), composite: { ...ok.composite } }; // #2345 — composited as read
  }
  if (inParts) { // #2346
    let out;
    try { out = await parseFileChunksInWorker(file, opts || {}); } catch (err) { throw new Error(tr("the file reader stopped ({error}); the file is too large to read another way", { error: err?.message || String(err) })); }
    const said = tr("Read in {n} parts: the file is {mb} MB, more than one text read can hold.", { n: out.parts, mb: Math.round(file.size / 1048576).toLocaleString() });
    return subsetNote({ ...out, note: [out.note, said].filter(Boolean).join(" ") }, opts);
  }
  if (typeof Worker !== "undefined" && file.size >= WORKER_MIN_BYTES) {
    try { return subsetNote(await parseInWorker(await file.arrayBuffer(), opts || {}), opts); } catch (err) {
      if (file.size >= MAIN_THREAD_RETRY_MAX) throw new Error(tr("the file reader stopped ({error}); the file is too large to read another way", { error: err?.message || String(err) }));
      /* read here instead */
    }
  }
  const { text, encoding } = decodeTableBytes(await file.arrayBuffer());
  return subsetNote(encodingNote(parseTableText(text, opts), encoding), opts);
}
// #2177 — said with the rows, so the import notice can carry it
function subsetNote(out, opts) {
  if (!opts?.keep?.length && !opts?.holes && !opts?.composite) return out;
  const cols = opts.keep?.length ? tr("Only {k} chosen column(s) were read, to fit in memory: {list}.", { k: opts.keep.length, list: opts.keep.slice(0, 12).join(", ") + (opts.keep.length > 12 ? ", ..." : "") }) : "";
  // #2321 — the holes subset, said with how many rows it left out
  const holes = opts.holes ? tr("Only the rows of {n} hole(s) ({which}) were read: {d} other row(s) were left out as the file was read.", { n: opts.holes.ids.length, which: opts.holes.label || opts.holes.col, d: (out.droppedByHole ?? 0).toLocaleString() }) : "";
  return { ...out, ...(opts.keep?.length ? { subset: opts.keep } : {}), ...(opts.holes ? { holesSubset: { col: opts.holes.col, n: opts.holes.ids.length } } : {}), note: [out.note, cols, holes, compositeNote(out.composited)].filter(Boolean).join(" ") };
}
// TASKS.csv #2345 — what the composite did, said with the rows (the import notice carries it)
export function compositeNote(st) {
  if (!st) return "";
  return [tr("Composited to {L} m as the file was read: {n} interval(s) of {h} hole(s) became {m} composite(s), each the length-weighted mean of its numeric columns ({cols}) and, for a text column, the value over most of its length; a hole's last composite stops where its intervals stop.", { L: st.lengthM, n: st.rowsIn.toLocaleString(), h: st.holes.toLocaleString(), m: st.composites.toLocaleString(), cols: st.numeric.slice(0, 8).join(", ") + (st.numeric.length > 8 ? ", ..." : "") || tr("none") }),
    st.textInNumeric ? tr("{n} text value(s) in numeric columns (such as below-detection entries) were left out of the means.", { n: st.textInNumeric.toLocaleString() }) : "",
    st.skipped ? tr("{n} row(s) with no hole, or no From / To with From above To, were left out.", { n: st.skipped.toLocaleString() }) : "",
    st.notTogether.length ? tr("{n} hole(s) had rows in more than one place in the file ({ids}): their intervals were composited together by depth.", { n: st.notTogether.length, ids: st.notTogether.slice(0, 5).join(", ") + (st.notTogether.length > 5 ? ", ..." : "") }) : "",
  ].filter(Boolean).join(" ");
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
  // rows that are plain lists (a sectioned report: project report, surface compare) carry their own header lines; keying
  // them by index wrote a "0,1,2,..." header row (#1083 found it, from #1022)
  if (rows.length && rows.every(Array.isArray)) { const w = arrMax(rows.map((r) => r.length)); /* #3031 — every row of a sheet */ return Papa.unparse(rows.map((r) => Array.from({ length: w }, (_, i) => r[i] ?? "")), { escapeFormulae: FORMULA_LEAD, ...opts }); }
  const fields = [], seen = new Set();
  for (const r of rows) for (const k of Object.keys(r || {})) if (!seen.has(k)) { seen.add(k); fields.push(k); }
  return Papa.unparse({ fields, data: rows.map((r) => fields.map((k) => r?.[k] ?? "")) }, { escapeFormulae: FORMULA_LEAD, ...opts });
}

// TASKS.csv #1064 — crsCell lives in lib/crsCell.js (TASKS.csv #1493: the 3D View imports it without this file's papaparse)
export { crsCell } from "./crsCell.js";
