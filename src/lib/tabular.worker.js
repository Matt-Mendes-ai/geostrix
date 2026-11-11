// TASKS.csv #583 — big CSV files decoded and parsed off the UI thread (see parseTableFile). A columnar result goes
// back as plain columns with its typed arrays transferred; the caller wraps them as rows. Otherwise the rows
// themselves are posted (structured clone).
import { decodeTableBytes, parseTableText, parseColumnsRaw, COLUMNAR_MIN_CHARS } from "./tabular.js";

const ROWS_PART = 100000;
self.onmessage = (e) => {
  const { buf, opts = {} } = e.data || {};
  try {
    const { text, encoding } = decodeTableBytes(buf);
    if (opts.columnar && !opts.composite && text.length >= COLUMNAR_MIN_CHARS) { // composite: TASKS.csv #2345 — the row reader composites
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
    if (rows.length <= ROWS_PART) { self.postMessage({ type: "rows", out, encoding }); return; }
    for (let i = 0; i < rows.length; i += ROWS_PART) self.postMessage({ type: "rows-part", rows: rows.slice(i, i + ROWS_PART) });
    self.postMessage({ type: "rows", out: { ...out, rows: null }, parts: Math.ceil(rows.length / ROWS_PART), encoding });
  } catch (err) {
    self.postMessage({ type: "error", message: err?.message || String(err) });
  }
};
