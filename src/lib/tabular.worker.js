// TASKS.csv #583 — big CSV files decoded and parsed off the UI thread (see parseTableFile). A columnar result goes
// back as plain columns with its typed arrays transferred; the caller wraps them as rows. Otherwise the rows
// themselves are posted (structured clone).
import { decodeTableBytes, parseTableText, parseColumnsRaw, COLUMNAR_MIN_CHARS } from "./tabular.js";

self.onmessage = (e) => {
  const { buf, opts = {} } = e.data || {};
  try {
    const { text, encoding } = decodeTableBytes(buf);
    if (opts.columnar && text.length >= COLUMNAR_MIN_CHARS) {
      const raw = parseColumnsRaw(text, opts);
      if (raw) {
        const transfer = raw.cols.flatMap((c) => (c.num ? [c.num.buffer, c.kind.buffer] : []));
        self.postMessage({ type: "columns", raw, encoding }, transfer);
        return;
      }
    }
    self.postMessage({ type: "rows", out: parseTableText(text, { ...opts, columnar: false }), encoding });
  } catch (err) {
    self.postMessage({ type: "error", message: err?.message || String(err) });
  }
};
