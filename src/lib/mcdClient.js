// TASKS.csv #3030 (split from #1999) — UI side of the MCD worker. From MCD_WORKER_FROM samples the fit runs in a worker of its own (one per
// run: a run is seconds, a worker starts in milliseconds), the packed values transferred, not copied; below it, or when no worker can start
// or the worker fails, the same mcdFromPacked runs here, after a pause so the 'Scoring…' state paints. cancel() drops the answer and stops
// the worker. -> { promise (the mcdAnomalyScores result), cancel }
import { mcdPack, mcdFromPacked } from "./mcd.js";

export const MCD_WORKER_FROM = 5000;

export function runMcdScores(rows, symbols, { opts = {}, makeWorker = null, workerFrom = MCD_WORKER_FROM, pause = (f) => setTimeout(f, 30) } = {}) {
  const n = (rows || []).length, D = symbols.length;
  let cancelled = false, worker = null;
  const promise = new Promise((resolve, reject) => {
    const here = () => pause(() => {
      if (cancelled) return;
      try { resolve(mcdFromPacked(mcdPack(rows, symbols), n, D, opts)); } catch (err) { reject(err); }
    });
    if (D < 3 || n < workerFrom) { here(); return; } // a small table, or the 'three elements' message: no worker needed
    try { worker = makeWorker ? makeWorker() : new Worker(new URL("./mcd.worker.js", import.meta.url), { type: "module" }); } catch { worker = null; }
    if (!worker) { here(); return; }
    worker.onmessage = (e) => {
      const d = e.data || {};
      worker?.terminate?.(); worker = null;
      if (cancelled) return;
      if (d.failed) reject(new Error(d.failed)); else resolve(d.result);
    };
    worker.onerror = (e) => { e?.preventDefault?.(); worker?.terminate?.(); worker = null; if (!cancelled) here(); };
    const packed = mcdPack(rows, symbols);
    worker.postMessage({ id: 1, packed, n, D, opts }, [packed.buffer]);
  });
  return { promise, cancel: () => { cancelled = true; worker?.terminate?.(); worker = null; } };
}
