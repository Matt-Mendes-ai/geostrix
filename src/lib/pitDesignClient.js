// TASKS.csv #1874 — UI side of the pit design worker, as pitShellClient.js: the shell's mesh and the blocks go as flat arrays.
// pit: the pit shell's generated surface ({ positions: Float32Array in SCENE space is not what we hold; the pane passes world
// positions }); model: the block model the pit was run on (or null). -> { promise, cancel }
import { voxelCellSupported } from "./viewer/geomath.js";
import { byColumnsOf } from "./pitShellClient.js"; // #1917

export function runPitDesignAsync(shellPositions, model, opts, terrain, collars, onProgress = null, byModel = null) { // byModel: #1917
  const cells = model ? (model.cells || []).filter((c) => voxelCellSupported(model, c)) : [], n = cells.length;
  const col = () => new Float64Array(n), columns = { x: col(), y: col(), z: col(), dx: col(), dy: col(), dz: col(), value: col(), coverage: col(), beyond: new Uint8Array(n) /* #2645 — 1 above, 2 below every sample */, density: new Float32Array(n).fill(NaN) /* #2647 */, nearUnsampled: new Uint8Array(n) /* #2735 */ };
  cells.forEach((c, i) => { columns.x[i] = c.x; columns.y[i] = c.y; columns.z[i] = c.z; columns.dx[i] = c.dx; columns.dy[i] = c.dy; columns.dz[i] = c.dz; columns.value[i] = c.value; columns.coverage[i] = Number.isFinite(c.coverage) ? c.coverage : NaN; columns.beyond[i] = c.beyond === "above" ? 1 : c.beyond === "below" ? 2 : 0; if (c.density > 0) columns.density[i] = c.density; if (c.nearUnsampled) columns.nearUnsampled[i] = 1; /* #2735 */ });
  let worker = null, settle = null;
  const promise = new Promise((resolve, reject) => {
    settle = resolve;
    worker = new Worker(new URL("./pitDesign.worker.js", import.meta.url), { type: "module" });
    worker.onmessage = (e) => {
      if (e.data.phases != null) { onProgress?.(e.data.phases); return; }
      worker.terminate();
      if (e.data.failed) reject(new Error(e.data.failed)); else resolve(e.data.result);
    };
    worker.onerror = (e) => { e.preventDefault?.(); worker.terminate(); reject(new Error(e.message || "worker failed")); };
    const t = terrain ? { bbox: terrain.bbox, gridW: terrain.gridW, gridH: terrain.gridH, elevations: terrain.elevations, noDataMask: terrain.noDataMask } : null;
    const cl = !t && collars ? collars.filter((c) => [c.x, c.y, c.z].every(Number.isFinite)).map((c) => ({ x: c.x, y: c.y, z: c.z })) : null;
    const sp = Float64Array.from(shellPositions);
    const by = byModel ? byColumnsOf(byModel) : null; // #1917
    worker.postMessage({ shellPositions: sp, terrain: t, collars: cl && cl.length ? cl : null, columns, byColumns: by, opts }, [sp.buffer, ...Object.values(columns).map((a) => a.buffer), ...(by ? Object.values(by).map((a) => a.buffer) : [])]);
  });
  return { promise, cancel: () => { worker?.terminate(); settle?.({ cancelled: true }); } };
}
