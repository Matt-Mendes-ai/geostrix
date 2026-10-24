// TASKS.csv #845 — terrain routing (fill, D8, accumulation; hydrology.js routeTerrain) off the UI thread: ~0.4 s for a
// 1025 x 1025 grid on a fast machine, several times that on a budget laptop. Static import: workers are one file.
import { routeTerrain } from "./hydrology.js";

self.onmessage = (e) => {
  try {
    const r = routeTerrain(e.data.terrain);
    self.postMessage({ id: e.data.id, ...r }, [r.dir.buffer, r.acc.buffer, r.order.buffer]);
  } catch (err) {
    self.postMessage({ id: e.data.id, failed: String(err?.message || err) });
  }
};
