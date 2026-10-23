// TASKS.csv #616 — radargram processing off the UI thread (gprProcess.js processRadargram). The raw channel is sent
// once per file ("load") and kept here; every "process" request carries only the settings, and its pixels are
// transferred back. Static import: workers are bundled as one file.
import { processRadargram } from "./gprProcess.js";

let raw = null; // { key, data, nscans, nsamp }
self.onmessage = (e) => {
  const m = e.data;
  if (m.type === "load") { raw = { key: m.key, data: m.data, nscans: m.nscans, nsamp: m.nsamp }; return; }
  try {
    if (!raw || raw.key !== m.key) throw new Error("radargram not loaded");
    const r = processRadargram(raw.data, raw.nscans, raw.nsamp, m.opts);
    self.postMessage({ id: m.id, ...r }, [r.pixels.buffer]);
  } catch (err) {
    self.postMessage({ id: m.id, failed: String(err?.message || err) });
  }
};
