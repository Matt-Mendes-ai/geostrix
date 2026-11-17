// TASKS.csv #3791 — validateSolid in a worker, kept per solid for the session (meshValidate's cache, shared with the Solids panel); the same check on the
// main thread when no worker can start. -> Promise of validateSolid's result
import { validateSolid, peekValidation, rememberValidation } from "./meshValidate.js";

let worker = null, nextId = 0;
const pending = new Map();
const start = () => {
  if (worker || typeof Worker === "undefined") return worker;
  try { worker = new Worker(new URL("./solidValidate.worker.js", import.meta.url), { type: "module" }); } catch { worker = null; return null; }
  worker.onmessage = (e) => { const p = pending.get(e.data.id); if (!p) return; pending.delete(e.data.id); if (e.data.failed) p.reject(new Error(e.data.failed)); else p.resolve(e.data.result); };
  worker.onerror = (e) => { e.preventDefault?.(); const all = [...pending.values()]; pending.clear(); worker?.terminate(); worker = null; all.forEach((p) => p.reject(new Error("the solid check stopped"))); };
  return worker;
};
export async function validateSolidAsync(positions, indices) {
  const kept = peekValidation(positions, indices);
  if (kept) return kept;
  const w = start();
  if (!w) return rememberValidation(positions, indices, validateSolid(positions, indices));
  try {
    const result = await new Promise((resolve, reject) => { const id = ++nextId; pending.set(id, { resolve, reject }); w.postMessage({ id, positions, indices }); });
    return rememberValidation(positions, indices, result);
  } catch { return rememberValidation(positions, indices, validateSolid(positions, indices)); }
}
