// TASKS.csv #3803 — the UI side of surveyChecks.worker.js: one worker for the session, and the answers kept per survey, so choosing IP chargeability,
// then resistivity, then chargeability again computes each once. With no worker (tests, an old runtime) the same function runs after a tick.
import { surveyChecks, surveyChecksInput } from "./surveyChecks.js";

let worker = null, nextId = 0;
const pending = new Map();
const cache = new Map(); // key -> Promise of the result; the last CACHE_MAX kept
const CACHE_MAX = 8;
const start = () => {
  if (worker || typeof Worker === "undefined") return worker;
  try { worker = new Worker(new URL("./surveyChecks.worker.js", import.meta.url), { type: "module" }); } catch { worker = null; return null; }
  worker.onmessage = (e) => { const p = pending.get(e.data?.id); if (!p) return; pending.delete(e.data.id); if (e.data.failed) p.reject(new Error(e.data.failed)); else p.resolve(e.data.result); };
  worker.onerror = (e) => { e.preventDefault?.(); const all = [...pending.values()]; pending.clear(); worker?.terminate(); worker = null; all.forEach((p) => { try { p.resolve(surveyChecks(p.input.packed, p.input.terrain, p.input.collars)); } catch (err) { p.reject(err); } }); };
  return worker;
};

// what names a survey's checks: the survey, its size and ends, the terrain and the collars they are measured against
export function surveyChecksKey(survey, rows, terrain, collars) {
  const n = rows?.length || 0, a = rows?.[0], b = rows?.[n - 1];
  return [survey || "", n, a?.x, a?.y, a?.z, b?.x, b?.y, b?.z, terrain?.name || "", terrain?.gridW || 0, terrain?.gridH || 0, terrain?.bbox?.join?.(",") || "", collars?.length || 0].join("|");
}

// -> Promise<{ spacing, coreHint, downhole, thinSuggestion }>
export function surveyChecksFor(key, rows, terrain, collars) {
  if (cache.has(key)) { const p = cache.get(key); cache.delete(key); cache.set(key, p); return p; }
  const input = surveyChecksInput(rows, terrain, collars);
  const w = start();
  const p = w
    ? new Promise((resolve, reject) => { const id = ++nextId; pending.set(id, { resolve, reject, input }); w.postMessage({ id, ...input }); })
    : new Promise((resolve, reject) => setTimeout(() => { try { resolve(surveyChecks(input.packed, input.terrain, input.collars)); } catch (err) { reject(err); } }, 0));
  cache.set(key, p);
  p.catch(() => cache.delete(key));
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  return p;
}
