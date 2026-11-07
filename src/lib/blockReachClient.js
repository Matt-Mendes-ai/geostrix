// TASKS.csv #1579 — UI side of the reach worker: one worker for the dialog's life, the newest request wins (an older answer is dropped),
// and the same code runs here when no worker can start.
import { reachSummary } from "./blockReach.js";

export function makeReachClient() {
  let worker = null, nextId = 0;
  const pending = new Map();
  const start = () => {
    if (worker || typeof Worker === "undefined") return worker;
    try { worker = new Worker(new URL("./blockReach.worker.js", import.meta.url), { type: "module" }); } catch { worker = null; return null; }
    worker.onmessage = (e) => { const p = pending.get(e.data.id); if (!p) return; pending.delete(e.data.id); if (e.data.failed) p.reject(new Error(e.data.failed)); else p.resolve(e.data.result); };
    worker.onerror = (e) => { e.preventDefault?.(); const all = [...pending.values()]; pending.clear(); worker?.terminate(); worker = null; all.forEach((p) => { try { p.resolve(reachSummary(p.args)); } catch (err) { p.reject(err); } }); };
    return worker;
  };
  return {
    // -> Promise of reachSummary's result; `latest()` says whether this is still the newest request when it resolves
    request(args) {
      const id = ++nextId;
      const w = start();
      const promise = w ? new Promise((resolve, reject) => { pending.set(id, { resolve, reject, args }); w.postMessage({ id, args }); }) : new Promise((resolve) => resolve(reachSummary(args)));
      return { promise, latest: () => id === nextId };
    },
    stop() { worker?.terminate(); worker = null; pending.clear(); },
  };
}
