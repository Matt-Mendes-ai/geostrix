// TASKS.csv #2279 — UI side of the stope-outline worker (the pitShellClient pattern): the blocks go as flat arrays, the pit ceiling as
// its grid. onProgress(level, levels). -> { promise, cancel }; a cancelled run resolves { cancelled: true }.
import { byColumnsOf } from "./pitShellClient.js"; // TASKS.csv #3084 — other grades' blocks (centre and value)
export function blockColumnsOf(model) {
  const cells = model?.cells || [], n = cells.length, col = () => new Float64Array(n);
  const out = { x: col(), y: col(), z: col(), dx: col(), dy: col(), dz: col(), value: col(), coverage: col() };
  cells.forEach((c, i) => { out.x[i] = c.x; out.y[i] = c.y; out.z[i] = c.z; out.dx[i] = c.dx; out.dy[i] = c.dy; out.dz[i] = c.dz; out.value[i] = c.value; out.coverage[i] = Number.isFinite(c.coverage) ? c.coverage : NaN; });
  return out;
}

export function runStopeOutlinesAsync(model, opts, ceiling = null, onProgress = null, ground = null, alsoModels = []) { // ground: #2438 — { values, frame } as the ceiling; alsoModels: #3084
  const columns = blockColumnsOf(model), also = (alsoModels || []).map((m) => byColumnsOf(m));
  let worker = null, settle = null;
  const promise = new Promise((resolve, reject) => {
    settle = resolve;
    worker = new Worker(new URL("./stopeOutlines.worker.js", import.meta.url), { type: "module" });
    worker.onmessage = (e) => {
      if (e.data.level != null) { onProgress?.(e.data.level, e.data.levels); return; }
      worker.terminate();
      if (e.data.failed) reject(new Error(e.data.failed)); else resolve(e.data.result);
    };
    worker.onerror = (e) => { e.preventDefault?.(); worker.terminate(); reject(new Error(e.message || "worker failed")); };
    worker.postMessage({ columns, alsoColumns: also, opts, ceiling, ground }, [...Object.values(columns).map((a) => a.buffer), ...also.flatMap((a) => Object.values(a).map((x) => x.buffer))]);
  });
  return { promise, cancel: () => { worker?.terminate(); settle?.({ cancelled: true }); } };
}
