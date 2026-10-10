// TASKS.csv #520 — UI-thread side of estimation.worker.js. runEstimation("block" | "dense", points, opts,
// { onProgress(fraction), signal }) resolves with exactly what estimateBlockModel / estimateDenseGrid return.
// Aborting the signal terminates the worker and rejects with an error whose .cancelled is true. If a worker
// can't be started at all, the estimator runs on this thread instead (slower to feel, same result).
export function runEstimation(kind, points, opts, { onProgress, signal } = {}) {
  return new Promise((resolve, reject) => {
    const cancelledError = () => Object.assign(new Error("Cancelled."), { cancelled: true });
    if (signal?.aborted) { reject(cancelledError()); return; }
    const inline = () => import("./estimation.js").then((m) => {
      if (signal?.aborted) throw cancelledError();
      const fn = kind === "dense" ? m.estimateDenseGrid : m.estimateBlockModel;
      return fn(points, { ...opts, onProgress });
    }).then(resolve, reject);
    let worker;
    try {
      worker = new Worker(new URL("./estimation.worker.js", import.meta.url), { type: "module" });
    } catch {
      inline();
      return;
    }
    let settled = false, heard = false;
    const finish = (fn, v) => { if (settled) return; settled = true; worker.terminate(); signal?.removeEventListener?.("abort", onAbort); fn(v); };
    const onAbort = () => finish(reject, cancelledError());
    signal?.addEventListener?.("abort", onAbort, { once: true });
    worker.onmessage = (e) => {
      heard = true;
      const d = e.data || {};
      if (d.type === "progress") onProgress?.(d.fraction);
      else if (d.type === "done") finish(resolve, d.result);
      else if (d.type === "error") finish(reject, new Error(d.message));
    };
    worker.onerror = (e) => {
      e.preventDefault?.();
      if (heard) { finish(reject, new Error(e.message || "The estimation worker stopped.")); return; }
      // never started (module workers unavailable, a blocked script): run here instead
      if (settled) return;
      settled = true; worker.terminate(); signal?.removeEventListener?.("abort", onAbort);
      inline();
    };
    worker.postMessage({ kind, points, opts });
  });
}
