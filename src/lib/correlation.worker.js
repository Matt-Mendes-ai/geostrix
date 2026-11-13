// TASKS.csv #3032 (split from #2904, WA iron review) — the correlation matrix off the UI thread: 27 elements on 147,891 samples still froze the
// window about 2 s after #2904. The worker keeps each element's column and its cache (prepared columns, computed pairs) for one `epoch` (the
// dialog's rows, units and below-detection choice), so a tick computes the new element's row only, as on the main thread. Static import:
// workers are one file.
import { correlationMatrix } from "./correlation.js";

let epoch = null, cols = {}, cache = new Map();
self.onmessage = (e) => {
  const d = e.data || {};
  try {
    if (d.epoch !== epoch) { epoch = d.epoch; cols = {}; cache = new Map(); }
    Object.assign(cols, d.cols || {});
    let last = 0;
    const m = correlationMatrix(cols, d.symbols || [], d.method, cache, (done, total) => {
      const now = performance.now();
      if (now - last > 100) { last = now; self.postMessage({ id: d.id, progress: { done, total } }); }
    });
    self.postMessage({ id: d.id, matrix: m });
  } catch (err) {
    self.postMessage({ id: d.id, failed: String(err?.message || err) });
  }
};
