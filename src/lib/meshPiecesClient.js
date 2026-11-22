// TASKS.csv #3991 — a mesh's pieces, labelled once per geometry and cached (a WeakMap on its index array, so an edited or replaced mesh is
// labelled afresh and a dropped one is forgotten). A big mesh (WORKER_MIN_FACES triangles and more) is labelled in a worker (meshPieces.worker.js,
// its index COPIED there); a small one, or when no worker can start, here at once.
import { labelPieces } from "./meshPieces.js";

export const WORKER_MIN_FACES = 150000;
const cache = new WeakMap();
let worker = null, seq = 0;
const waiting = new Map();

function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL("./meshPieces.worker.js", import.meta.url), { type: "module" });
  worker.onmessage = (e) => { const w = waiting.get(e.data.id); if (!w) return; waiting.delete(e.data.id); if (e.data.ok) w.resolve(e.data.result); else w.reject(new Error(e.data.error)); };
  worker.onerror = (e) => { e.preventDefault?.(); for (const w of waiting.values()) w.reject(new Error(e.message || "piece labelling stopped")); waiting.clear(); worker = null; };
  return worker;
}

// geometry: a three.js BufferGeometry -> Promise of labelPieces' result (null for an unindexed mesh: its triangles share no vertex)
export function piecesOf(geometry) {
  const index = geometry?.index?.array, n = geometry?.attributes?.position?.count;
  if (!index || !n) return Promise.resolve(null);
  const hit = cache.get(index);
  if (hit) return hit;
  let p;
  if (index.length / 3 >= WORKER_MIN_FACES && typeof Worker !== "undefined") {
    p = new Promise((resolve, reject) => {
      try { const w = getWorker(), id = ++seq, copy = new Uint32Array(index); waiting.set(id, { resolve, reject }); w.postMessage({ id, index: copy, vertexCount: n }, [copy.buffer]); } catch (e) { reject(e); }
    }).catch(() => labelPieces(index, n));
  } else p = Promise.resolve(labelPieces(index, n));
  cache.set(index, p);
  return p;
}
