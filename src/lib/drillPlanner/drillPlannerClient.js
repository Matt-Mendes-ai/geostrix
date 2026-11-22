// TASKS.csv #3962 (P1) — the interface side of drillPlanner.worker.js, on estimationClient.js's pattern: runPlanner(job, { onProgress,
// signal }) resolves with the worker's result; aborting the signal ends the worker and rejects with .cancelled; with no worker (a
// blocked module worker) the same functions run on this thread.
import { t as tr } from "../i18n.js";

export function runPlanner(job, { onProgress, signal } = {}) {
  return new Promise((resolve, reject) => {
    const cancelled = () => Object.assign(new Error("Cancelled."), { cancelled: true });
    if (signal?.aborted) { reject(cancelled()); return; }
    const inline = () => Promise.all([import("./holePrediction.js"), import("./program.js")]).then(([m, pg]) => {
      if (job.kind === "program") return pg.selectProgram(job.model, job.candidates, job.rules, { ...job.opts, onProgress });
      if (job.kind === "fit") return m.fitGradeModel(job.points, { model: job.modelType, searchTrend: job.searchTrend });
      const out = {};
      job.holes.forEach((h, i) => { if (signal?.aborted) throw cancelled(); out[h.id] = m.predictHole(job.model, h.trace, job.rules, job.opts); onProgress?.((i + 1) / job.holes.length); });
      return out;
    }).then(resolve, reject);
    let worker;
    try { worker = new Worker(new URL("./drillPlanner.worker.js", import.meta.url), { type: "module" }); } catch { inline(); return; }
    let settled = false, heard = false;
    const finish = (fn, v) => { if (settled) return; settled = true; worker.terminate(); signal?.removeEventListener?.("abort", onAbort); fn(v); };
    const onAbort = () => finish(reject, cancelled());
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
      if (heard) { finish(reject, new Error(e.message || tr("The drill planner's worker stopped."))); return; }
      if (settled) return;
      settled = true; worker.terminate(); signal?.removeEventListener?.("abort", onAbort);
      inline();
    };
    // the model's caches (a search index with functions) stay on this side: only its data cross
    worker.postMessage(job.model ? { ...job, model: Object.fromEntries(Object.entries(job.model).filter(([k]) => !k.startsWith("_"))) } : job);
  });
}
