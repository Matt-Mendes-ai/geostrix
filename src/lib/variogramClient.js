// TASKS.csv #3009 — the UI side of variogram.worker.js: one worker per dialog; a points array goes once (as columns) and is named by key
// after, for the direction table. Cancel terminates the worker (the next request starts a new one). With no worker the same code runs
// here, as before.
import { experimentalVariogram, directionRow, suggestBetweenHoleLag, suggestLagDistance } from "./variogram.js";
import { packPointsSliced } from "./pointColumns.js"; // sliced: TASKS.csv #3403

export function makeVariogramClient() {
  let worker = null, nextId = 0, sentKey = null, seq = 0, ready = Promise.resolve(); // ready: #3403 — requests post in the order they were made, after their points are packed
  const ids = new WeakMap(), pending = new Map();
  // #3403 — 'suggest': the two lag suggestions (the spacing between holes, the nearest-neighbour spacing), each a grid search over every point
  const suggestOf = (points, o) => ({ between: o?.between ? suggestBetweenHoleLag(points) : null, lag: o?.lag ? suggestLagDistance(points) : null });
  const local = (kind, points, opts, dir, model) => (kind === "suggest" ? suggestOf(points, opts) : kind === "dir" ? directionRow(points, opts, dir, model) : experimentalVariogram(points, opts));
  const start = () => {
    if (worker || typeof Worker === "undefined") return worker;
    try { worker = new Worker(new URL("./variogram.worker.js", import.meta.url), { type: "module" }); } catch { worker = null; return null; }
    worker.onmessage = (e) => { const p = pending.get(e.data.id); if (!p) return; pending.delete(e.data.id); if (e.data.failed) p.reject(new Error(e.data.failed)); else p.resolve(e.data.result); };
    worker.onerror = (e) => { e.preventDefault?.(); const all = [...pending.values()]; pending.clear(); worker?.terminate(); worker = null; sentKey = null; all.forEach((p) => { try { p.resolve(local(p.kind, p.points, p.opts, p.dir, p.model)); } catch (err) { p.reject(err); } }); };
    return worker;
  };
  const request = (kind, points, opts, { dir = null, model = null } = {}) => {
    if (!ids.has(points)) ids.set(points, ++seq);
    const key = ids.get(points), id = ++nextId, w = start();
    if (!w) return new Promise((resolve, reject) => setTimeout(() => { try { resolve(local(kind, points, opts, dir, model)); } catch (err) { reject(err); } }, 0));
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject, kind, points, opts, dir, model });
      const send = sentKey !== key; sentKey = key;
      // TASKS.csv #3403 — packed in slices (it was one 0.25-0.4 s task on 147,601 points); a later request for the same points waits behind this one
      ready = ready.then(() => (send ? packPointsSliced(points) : null)).then((packed) => { if (pending.has(id)) w.postMessage({ id, kind, key, ...(packed ? { packed } : {}), opts, dir, model }); }, (err) => { if (pending.has(id)) { pending.delete(id); reject(err); } });
    });
  };
  return {
    variogram: (points, opts) => request("vg", points, opts),
    suggest: (points, o) => request("suggest", points, o), // { between, lag }: #3403
    directionRow: (points, base, dir, model) => request("dir", points, base, { dir, model }),
    // Cancel: whatever is running is dropped (its promise rejects with .cancelled)
    cancel() { const all = [...pending.values()]; pending.clear(); ready = Promise.resolve(); worker?.terminate(); worker = null; sentKey = null; all.forEach((p) => p.reject(Object.assign(new Error("Cancelled."), { cancelled: true }))); },
    stop() { worker?.terminate(); worker = null; sentKey = null; pending.clear(); ready = Promise.resolve(); },
  };
}
