// TASKS.csv #3032 — UI side of the correlation worker. One worker per open dialog; each element's column is sent once per epoch (as a
// Float64Array, NaN for no value, transferred), so a tick sends only the new column. A newer request supersedes an older one (its answer is
// ignored). If no worker can start, or it fails, the same correlationMatrix runs here instead, with the caller's own cache.
import { correlationMatrix } from "./correlation.js";

// above this many rows the matrix is computed in the worker (below it, a few hundred ms at most: the main thread is quicker than a round trip)
export const CORRELATION_WORKER_FROM = 20000;

// cols: symbol -> array of numbers or null -> Float64Array (NaN for no value), the shape the worker keeps
export function packColumn(arr) {
  const out = new Float64Array(arr.length);
  for (let i = 0; i < arr.length; i++) { const v = arr[i]; out[i] = v == null || !Number.isFinite(v) ? NaN : v; }
  return out;
}

export function createCorrelationClient({ makeWorker } = {}) {
  let worker = null, failed = false, seq = 0, sentEpoch = null, sent = new Set();
  const pending = new Map();
  const start = () => {
    if (worker || failed) return worker;
    try { worker = makeWorker ? makeWorker() : new Worker(new URL("./correlation.worker.js", import.meta.url), { type: "module" }); } catch { failed = true; return null; }
    worker.onmessage = (e) => {
      const d = e.data || {}, p = pending.get(d.id);
      if (!p) return;
      if (d.progress) { p.onProgress?.(d.progress); return; }
      pending.delete(d.id);
      if (d.failed) p.reject(new Error(d.failed)); else p.resolve(d.matrix);
    };
    worker.onerror = (e) => { e?.preventDefault?.(); failed = true; const all = [...pending.values()]; pending.clear(); worker?.terminate?.(); worker = null; all.forEach((p) => p.fallback()); };
    return worker;
  };
  return {
    // cols: the caller's columns (symbol -> array), cache: the caller's Map for the fallback; epoch: any value that changes when the rows do
    compute({ epoch, cols, symbols, method, cache, onProgress }) {
      const id = ++seq;
      let cancelled = false;
      const promise = new Promise((resolve, reject) => {
        const here = () => { try { resolve(correlationMatrix(cols, symbols, method, cache)); } catch (err) { reject(err); } };
        const w = start();
        if (!w) { here(); return; }
        if (epoch !== sentEpoch) { sentEpoch = epoch; sent = new Set(); }
        const fresh = {}, transfer = [];
        for (const s of symbols) if (!sent.has(s) && cols[s]) { fresh[s] = packColumn(cols[s]); transfer.push(fresh[s].buffer); sent.add(s); }
        pending.set(id, { resolve: (m) => { if (!cancelled) resolve(m); }, reject: (err) => { if (!cancelled) reject(err); }, onProgress: (p) => { if (!cancelled) onProgress?.(p); }, fallback: () => { if (!cancelled) here(); } });
        w.postMessage({ id, epoch, cols: fresh, symbols, method }, transfer);
      });
      return { promise, cancel: () => { cancelled = true; pending.delete(id); } };
    },
    terminate() { worker?.terminate?.(); worker = null; pending.clear(); },
  };
}
