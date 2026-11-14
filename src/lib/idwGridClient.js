// TASKS.csv #3444 — UI side of the IDW worker (lib/idwGrid.worker.js). If no worker can start, the same code runs here.
// -> { promise ({ gridW, gridH, values }, or { cancelled: true }), cancel() }. onProgress(0..1) is called as the rows are done.
import { idwGrid } from "./idw.js";

export function idwGridAsync(points, opts, { onProgress } = {}) {
  let w = null, settle = null;
  const promise = new Promise((resolve, reject) => {
    settle = resolve;
    const here = () => { try { resolve(idwGrid(points, opts)); } catch (e) { reject(e); } };
    try { w = new Worker(new URL("./idwGrid.worker.js", import.meta.url), { type: "module" }); } catch { here(); return; }
    w.onmessage = (e) => {
      if (e.data.progress != null) { onProgress?.(e.data.progress); return; }
      w.terminate(); w = null;
      if (e.data.failed) reject(new Error(e.data.failed)); else resolve(e.data);
    };
    w.onerror = (e) => { e.preventDefault?.(); w?.terminate(); w = null; here(); };
    w.postMessage({ pts: points.map((r) => ({ x: r.x, y: r.y, value: r.value })), opts });
  });
  return { promise, cancel: () => { if (w) { w.terminate(); w = null; settle?.({ cancelled: true }); } } };
}
