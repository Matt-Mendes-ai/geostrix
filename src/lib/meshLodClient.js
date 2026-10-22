// TASKS.csv #795 — UI-thread side of the drawing-copy simplifier: one shared worker (meshLod.worker.js), requests in
// order. The positions and index are COPIED to it (the originals stay with the mesh). If no worker can start, the same
// code runs here instead: slower to feel, same result.
let worker = null, seq = 0;
const waiting = new Map();

function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL("./meshLod.worker.js", import.meta.url), { type: "module" });
  worker.onmessage = (e) => {
    const w = waiting.get(e.data.id);
    if (!w) return;
    waiting.delete(e.data.id);
    if (e.data.failed) w.reject(new Error(e.data.failed)); else w.resolve(e.data);
  };
  worker.onerror = (e) => { e.preventDefault?.(); for (const w of waiting.values()) w.reject(new Error(e.message || "mesh simplifier stopped")); waiting.clear(); worker = null; };
  return worker;
}

export function simplifyForDrawing(positions, index, opts = {}) {
  const pos = new Float32Array(positions), idx = new Uint32Array(index);
  try {
    const w = getWorker(), id = ++seq;
    return new Promise((resolve, reject) => {
      waiting.set(id, { resolve, reject });
      w.postMessage({ id, positions: pos, index: idx, ...opts }, [pos.buffer, idx.buffer]);
    });
  } catch {
    return import("./meshLod.js").then(({ simplifyIndex }) => simplifyIndex(pos, idx, opts));
  }
}
