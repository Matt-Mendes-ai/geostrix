// TASKS.csv #2846 — minimum curvature of a point survey off the UI thread: the 7,810 Blake River stations at 100 m (480,000 nodes) took
// 41 s on a busy machine. Static import: workers are one file.
import { gridSurvey } from "./surveyGrid.js";

self.onmessage = (e) => {
  try {
    const r = gridSurvey(e.data.pts, e.data.opts);
    if (r.grid?.values) self.postMessage(r, [r.grid.values.buffer]);
    else self.postMessage(r);
  } catch (err) {
    self.postMessage({ failed: String(err?.message || err) });
  }
};
