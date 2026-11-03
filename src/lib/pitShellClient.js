// TASKS.csv #1341 — UI side of the pit worker. The blocks go as flat arrays: cloning 200,000 objects would stall the window it
// is there to keep free. A window that cannot start a worker gets an error, not a frozen minute. -> { promise, cancel }
import { voxelCellSupported } from "./viewer/geomath.js";

export function runPitShellAsync(model, inputs, terrain, onProgress, collars = null) { // collars: #1353 — the ground when there is no terrain
  const cells = (model.cells || []).filter((c) => voxelCellSupported(model, c)), n = cells.length;
  const col = () => new Float64Array(n), columns = { x: col(), y: col(), z: col(), dx: col(), dy: col(), dz: col(), value: col(), coverage: col(), nHoles: new Uint16Array(n), support: new Uint8Array(n) };
  const SUP = { interpolated: 1, extrapolated: 2, unsupported: 3 }; // #1354
  cells.forEach((c, i) => {
    columns.x[i] = c.x; columns.y[i] = c.y; columns.z[i] = c.z; columns.dx[i] = c.dx; columns.dy[i] = c.dy; columns.dz[i] = c.dz; columns.value[i] = c.value;
    columns.coverage[i] = Number.isFinite(c.coverage) ? c.coverage : NaN;
    columns.nHoles[i] = Number.isFinite(c.nHoles) ? c.nHoles : 0; columns.support[i] = SUP[c.support] || 0;
  });
  let worker = null, settle = null;
  const promise = new Promise((resolve, reject) => {
    settle = resolve;
    worker = new Worker(new URL("./pitShell.worker.js", import.meta.url), { type: "module" });
    worker.onmessage = (e) => {
      if (e.data.phases != null) { onProgress?.(e.data.phases); return; }
      worker.terminate();
      if (e.data.failed) reject(new Error(e.data.failed)); else resolve(e.data.result);
    };
    worker.onerror = (e) => { e.preventDefault?.(); worker.terminate(); reject(new Error(e.message || "worker failed")); };
    const t = terrain ? { bbox: terrain.bbox, gridW: terrain.gridW, gridH: terrain.gridH, elevations: terrain.elevations, noDataMask: terrain.noDataMask } : null;
    const cl = !t && collars ? collars.filter((c) => [c.x, c.y, c.z].every(Number.isFinite)).map((c) => ({ x: c.x, y: c.y, z: c.z })) : null;
    worker.postMessage({ inputs, columns, terrain: t, collars: cl }, Object.values(columns).map((a) => a.buffer));
  });
  return { promise, cancel: () => { worker?.terminate(); settle?.({ cancelled: true }); } };
}
