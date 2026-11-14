// TASKS.csv #3085 — the UI-thread side of the layer-cake worker (layerCake.worker.js): one worker per run, ended with it. Where no Worker
// exists (the tests, an old runtime) the same function runs here. onProgress(done, total). -> { surfaces, block, evaluated, grid, report }
// or { error }
import { layerCake } from "./layerCake.js";

let seq = 0;
export function runLayerCake(specs, extent, resolution, { evalPts = null, onProgress = null, faults = [] } = {}) {
  // only what the cake reads goes to the worker (the specs carry orientations, codes and more)
  const slim = specs.map((s) => ({ meshName: s.meshName, package: s.package, points: s.points.map((p) => ({ x: p.x, y: p.y, z: p.z, hole_id: p.hole_id })) }));
  // TASKS.csv #3086 — the faults: their points and orientations (each becomes a plane)
  const slimFaults = (faults || []).map((f) => ({ meshName: f.meshName, points: f.points.map((p) => ({ x: p.x, y: p.y, z: p.z })), orientations: (f.orientations || []).map((o) => ({ dip: o.dip, azimuth: o.azimuth })) }));
  if (typeof Worker === "undefined") return Promise.resolve(layerCake(slim, extent, resolution, { evalPts, onProgress, faults: slimFaults }));
  return new Promise((resolve) => {
    let worker;
    try { worker = new Worker(new URL("./layerCake.worker.js", import.meta.url), { type: "module" }); } catch { resolve(layerCake(slim, extent, resolution, { evalPts, onProgress, faults: slimFaults })); return; }
    const id = ++seq;
    worker.onmessage = ({ data }) => {
      if (data.id !== id) return;
      if (data.progress) { onProgress?.(...data.progress); return; }
      worker.terminate();
      resolve(data.failed ? { error: data.failed } : data.res);
    };
    worker.onerror = (e) => { worker.terminate(); resolve({ error: e?.message || "the layer-cake worker failed" }); };
    worker.postMessage({ id, specs: slim, extent, resolution, evalPts, faults: slimFaults });
  });
}
