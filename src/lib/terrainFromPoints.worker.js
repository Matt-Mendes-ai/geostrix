// TASKS.csv #986 — the terrain TIN off the UI thread (0.4-2.1 s of frozen view on a contour file at the finer terrain
// details). Same function, so the result is identical.
import { terrainFromPoints } from "./terrainFromPoints.js";

self.onmessage = (e) => {
  const { input, opts } = e.data;
  try {
    self.postMessage({ res: terrainFromPoints(input, opts) });
  } catch (err) {
    self.postMessage({ failed: String(err?.message || err) });
  }
};
