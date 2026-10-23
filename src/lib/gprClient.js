// TASKS.csv #616 — UI side of the radargram worker: one worker, the raw channel copied to it once per file, and only the
// newest request answered (a burst of slider moves processes once at the end, never queues up). If no worker can start,
// the same code runs here instead.
import { processRadargram } from "./gprProcess.js";

let worker = null, loadedKey = null, seq = 0;
const waiting = new Map();

function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL("./gprProcess.worker.js", import.meta.url), { type: "module" });
  worker.onmessage = (e) => {
    const w = waiting.get(e.data.id);
    if (!w) return;
    waiting.delete(e.data.id);
    if (e.data.failed) w.reject(new Error(e.data.failed)); else w.resolve(e.data);
  };
  worker.onerror = (e) => { e.preventDefault?.(); for (const w of waiting.values()) w.reject(new Error(e.message || "radargram worker stopped")); waiting.clear(); worker = null; loadedKey = null; };
  return worker;
}

// -> Promise of { pixels, width, height, nsamp, steps }, or null when a newer request has replaced this one
export function processInWorker(key, raw, nscans, nsamp, opts) {
  let w;
  try { w = getWorker(); } catch { return Promise.resolve(processRadargram(raw, nscans, nsamp, opts)); }
  if (loadedKey !== key) { const copy = new Float32Array(raw); w.postMessage({ type: "load", key, data: copy, nscans, nsamp }, [copy.buffer]); loadedKey = key; }
  const id = ++seq;
  for (const [k, p] of waiting) { if (k < id) { p.resolve(null); waiting.delete(k); } } // superseded
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    w.postMessage({ type: "process", id, key, opts });
  });
}
