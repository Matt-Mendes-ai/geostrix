// TASKS.csv #3444 (the #3363 follow-up) — IDW of a point survey off the UI thread: its time follows the cells (about 10 microseconds each: 11.5 s at
// 1.2 million), so a fine grid stopped the window. Progress by rows; Cancel terminates the worker (lib/idwGridClient.js). Static import: workers are one file.
import { idwGrid } from "./idw.js";

self.onmessage = (e) => {
  try {
    const { pts, opts } = e.data;
    const r = idwGrid(pts, { ...opts, onRow: (row, rows) => self.postMessage({ progress: row / rows }) });
    self.postMessage(r, [r.values.buffer]);
  } catch (err) {
    self.postMessage({ failed: String(err?.message || err) });
  }
};
