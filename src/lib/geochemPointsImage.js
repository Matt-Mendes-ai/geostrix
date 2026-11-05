// TASKS.csv #1519 (review #1497, Lawyers) — a large Geochem plot's points as one picture, drawn and PNG-encoded in a worker on an
// OffscreenCanvas. Drawing 83,670 circles on the main thread costs ~100 ms, and encoding the 1240 x 1120 picture ~210 ms more
// (toBlob encodes on the main thread here), so every diagram switch stalled the window; in the worker the main thread only
// gathers the points (positions and a colour index each) and places the finished picture.
//
// points: { xs, ys (Float32Array, plot px), ci (Uint32Array: palette index per point), palette (colour strings) }

export function drawPoints(ctx, { xs, ys, ci, palette }, k = 2) {
  ctx.lineWidth = 0.5 * k; ctx.strokeStyle = "#ffffff";
  let last = -1;
  for (let i = 0; i < xs.length; i++) {
    if (ci[i] !== last) { ctx.fillStyle = palette[ci[i]]; last = ci[i]; }
    ctx.beginPath(); ctx.arc(xs[i] * k, ys[i] * k, 3 * k, 0, Math.PI * 2);
    ctx.globalAlpha = 0.75; ctx.fill(); ctx.globalAlpha = 1; ctx.stroke();
  }
}

// The plot's points (with their colour function) as the typed arrays the worker takes.
export function packPoints(ordered, colorBy) {
  const n = ordered.length, xs = new Float32Array(n), ys = new Float32Array(n), ci = new Uint32Array(n), palette = [], index = new Map();
  for (let i = 0; i < n; i++) {
    const q = ordered[i]; xs[i] = q.cx; ys[i] = q.cy;
    const c = colorBy(q.p.sample);
    let k = index.get(c);
    if (k === undefined) { k = palette.length; palette.push(c); index.set(c, k); }
    ci[i] = k;
  }
  return { xs, ys, ci, palette };
}

// One worker for the session (spawning one per diagram switch paid its start and module fetch each time: the first picture came
// late). Each request carries an id; a result for a request the plot has moved on from is dropped by the caller.
// Rejects when workers or OffscreenCanvas are unavailable or the worker fails: the caller then draws on the main thread.
let worker = null, nextId = 1;
const pending = new Map();
function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL("./geochemPoints.worker.js", import.meta.url), { type: "module" });
  worker.onmessage = (e) => { const p = pending.get(e.data.id); if (!p) return; pending.delete(e.data.id); if (e.data.failed) p.reject(new Error(e.data.failed)); else p.resolve(e.data.blob); };
  worker.onerror = (e) => { e.preventDefault?.(); pending.forEach((p) => p.reject(new Error("worker"))); pending.clear(); worker.terminate(); worker = null; };
  return worker;
}
export function renderPointsImage(points, { W, H, k = 2 }) {
  if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") return Promise.reject(new Error("no worker"));
  return new Promise((resolve, reject) => {
    let w;
    try { w = getWorker(); } catch (e) { reject(e); return; }
    const id = nextId++;
    pending.set(id, { resolve, reject });
    w.postMessage({ ...points, W, H, k, id }, [points.xs.buffer, points.ys.buffer, points.ci.buffer]);
  });
}
