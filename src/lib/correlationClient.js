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
  // TASKS.csv #3232 — the worker is told the epoch by number (epochNo), never the epoch itself: the dialog's epoch is its caches object, every
  // column as a plain array, and posting it cloned them all on the main thread (about 480 ms at 147,000 samples x 12 elements); the clone was
  // also a new object each time, so the worker dropped its columns on every request and a tick computed the earlier pairs without them
  let worker = null, failed = false, seq = 0, sentEpoch = null, epochNo = 0, sent = new Set();
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
    // (compared here by identity; only a number per epoch is posted, #3232)
    compute({ epoch, cols, symbols, method, cache, onProgress }) {
      const id = ++seq;
      let cancelled = false;
      const promise = new Promise((resolve, reject) => {
        const here = () => { try { resolve(correlationMatrix(cols, symbols, method, cache)); } catch (err) { reject(err); } };
        const w = start();
        if (!w) { here(); return; }
        if (epoch !== sentEpoch) { sentEpoch = epoch; epochNo++; sent = new Set(); }
        const fresh = {}, transfer = [];
        for (const s of symbols) if (!sent.has(s) && cols[s]) { fresh[s] = packColumn(cols[s]); transfer.push(fresh[s].buffer); sent.add(s); }
        pending.set(id, { resolve: (m) => { if (!cancelled) resolve(m); }, reject: (err) => { if (!cancelled) reject(err); }, onProgress: (p) => { if (!cancelled) onProgress?.(p); }, fallback: () => { if (!cancelled) here(); } });
        w.postMessage({ id, epoch: epochNo, cols: fresh, symbols, method }, transfer);
      });
      return { promise, cancel: () => { cancelled = true; pending.delete(id); } };
    },
    terminate() { worker?.terminate?.(); worker = null; pending.clear(); },
  };
}

// TASKS.csv #3125 (split from #3032) — on open, the element columns themselves (valueIn on every row, and the below-detection flags) blocked
// the window about 1 s at 147,000 samples x 12 elements before the worker had anything to do. Above CORRELATION_WORKER_FROM rows they are
// built in slices of about `budget` ms (blocks of `chunk` rows, the clock read between blocks) with a pause between slices, so the window
// keeps drawing; a pause per block of rows instead made 108 timer pauses and tripled the build under load. A column is stored only once it
// is complete, and a cancelled build (the dialog closed, the rows or the elements changed) stops at the next pause. -> true when all built.
// rows: the assays; cols / lt: the caller's caches (symbol -> array / Uint8Array), filled in place; valueOf(row, symbol), ltOf(row, symbol)
export async function buildColumns({ rows, symbols, cols, lt, valueOf, ltOf, detectedOnly = false, chunk = 4096, budget = 12, now = () => performance.now(), pause = () => new Promise((r) => setTimeout(r, 0)), cancelled = () => false }) {
  const n = (rows || []).length;
  let sliceStart = now();
  for (const s of symbols) {
    if (cols[s] && lt[s]) continue;
    const L = new Uint8Array(n), C = new Array(n);
    for (let i0 = 0; i0 < n; i0 += chunk) {
      const i1 = Math.min(n, i0 + chunk);
      for (let i = i0; i < i1; i++) { const r = rows[i]; L[i] = ltOf(r, s) ? 1 : 0; C[i] = detectedOnly && L[i] ? null : valueOf(r, s); }
      if (now() - sliceStart >= budget) { await pause(); if (cancelled()) return false; sliceStart = now(); }
    }
    lt[s] = L; cols[s] = C;
  }
  return !cancelled();
}
