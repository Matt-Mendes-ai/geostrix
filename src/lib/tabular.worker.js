// TASKS.csv #583 — big CSV files decoded and parsed off the UI thread (see parseTableFile). A columnar result goes
// back as plain columns with its typed arrays transferred; the caller wraps them as rows. Otherwise the rows
// themselves are posted (structured clone).
import { decodeTableBytes, parseTableText, parseColumnsRaw, COLUMNAR_MIN_CHARS, parseTableChunks, fileChunks } from "./tabular.js"; // parseTableChunks: TASKS.csv #2346
import { logTableBuffers } from "./logOnRead.js"; // TASKS.csv #3038

const ROWS_PART = 100000;
// TASKS.csv #2346 — a file over 512 MB comes as the File itself and is read in parts (file.slice), never as one string
async function sendRows(out) {
  const rows = out.rows || [];
  if (rows.length <= ROWS_PART) { self.postMessage({ type: "rows", out }, logTableBuffers(out.logTable)); return; } // #3038 — the log's arrays moved, not copied
  for (let i = 0; i < rows.length; i += ROWS_PART) self.postMessage({ type: "rows-part", rows: rows.slice(i, i + ROWS_PART) });
  self.postMessage({ type: "rows", out: { ...out, rows: null } }, logTableBuffers(out.logTable));
}
self.onmessage = (e) => {
  const { buf, opts = {}, file } = e.data || {};
  if (file && opts.chunked) {
    parseTableChunks(fileChunks(file), opts).then(sendRows).catch((err) => self.postMessage({ type: "error", message: err?.message || String(err) }));
    return;
  }
  try {
    const { text, encoding } = decodeTableBytes(buf);
    if (opts.columnar && !opts.composite && !opts.logRead && text.length >= COLUMNAR_MIN_CHARS) { // logRead: #3038 // composite: TASKS.csv #2345 — the row reader composites
      const raw = parseColumnsRaw(text, opts);
      if (raw) {
        const transfer = raw.cols.flatMap((c) => (c.num ? [c.num.buffer, c.kind.buffer] : []));
        self.postMessage({ type: "columns", raw, encoding }, transfer);
        return;
      }
    }
    // TASKS.csv #2175 — the rows go back in parts: one message of 1.5 M row objects took 1.1 s to unpack on the window's thread in one
    // go; parts of ROWS_PART unpack as separate short tasks, and the window answers in between
    const out = parseTableText(text, { ...opts, columnar: false });
    const rows = out.rows || [];
    if (rows.length <= ROWS_PART) { self.postMessage({ type: "rows", out, encoding }, logTableBuffers(out.logTable)); return; } // #3038
    for (let i = 0; i < rows.length; i += ROWS_PART) self.postMessage({ type: "rows-part", rows: rows.slice(i, i + ROWS_PART) });
    self.postMessage({ type: "rows", out: { ...out, rows: null }, parts: Math.ceil(rows.length / ROWS_PART), encoding }, logTableBuffers(out.logTable));
  } catch (err) {
    self.postMessage({ type: "error", message: err?.message || String(err) });
  }
};
