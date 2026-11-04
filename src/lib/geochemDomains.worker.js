// TASKS.csv #1797 (review #1646, Kodiak) — the log-ratio PCA and k-means (lib/geochemDomains.js) off the UI thread: 2,705 soils x 53
// elements froze the window 7.1 s. Static import: workers are one file.
import { geochemDomains } from "./geochemDomains.js";

self.onmessage = (e) => {
  try {
    const { samples, symbols, units, k } = e.data;
    self.postMessage({ id: e.data.id, result: geochemDomains(samples, symbols, units, { k }) });
  } catch (err) {
    self.postMessage({ id: e.data.id, failed: String(err?.message || err) });
  }
};
