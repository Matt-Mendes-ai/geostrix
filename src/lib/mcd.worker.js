// TASKS.csv #3030 (split from #1999) — the MCD anomaly score off the UI thread: the packed values in, the scores out (lib/mcd.js
// mcdFromPacked, the same code the main thread runs on a small table). Static import: workers are one file.
import { mcdFromPacked } from "./mcd.js";

self.onmessage = (e) => {
  const d = e.data || {};
  try {
    self.postMessage({ id: d.id, result: mcdFromPacked(d.packed, d.n, d.D, d.opts || {}) });
  } catch (err) {
    self.postMessage({ id: d.id, failed: String(err?.message || err) });
  }
};
