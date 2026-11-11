// TASKS.csv #1875 — UI side of the nested-pit worker, as pitShellClient.js. -> { promise, cancel }
import { voxelCellSupported } from "./viewer/geomath.js";
import { byColumnsOf } from "./pitShellClient.js"; // #1917

export function runPitSeriesAsync(model, inputs, rfs, { rate = null, discountPct = null, terrain = null, collars = null, byModel = null, onProgress = null } = {}) { // byModel: #1917
  const cells = (model.cells || []).filter((c) => voxelCellSupported(model, c)), n = cells.length;
  const col = () => new Float64Array(n), columns = { x: col(), y: col(), z: col(), dx: col(), dy: col(), dz: col(), value: col(), coverage: col(), nHoles: new Uint16Array(n), holeShare: new Float32Array(n).fill(NaN) /* #1617 */, support: new Uint8Array(n), beyond: new Uint8Array(n) /* #2435 */, nearUnsampled: new Uint8Array(n) /* #2596 */ };
  const SUP = { interpolated: 1, extrapolated: 2, unsupported: 3 };
  cells.forEach((c, i) => {
    columns.x[i] = c.x; columns.y[i] = c.y; columns.z[i] = c.z; columns.dx[i] = c.dx; columns.dy[i] = c.dy; columns.dz[i] = c.dz; columns.value[i] = c.value;
    columns.coverage[i] = Number.isFinite(c.coverage) ? c.coverage : NaN; columns.nHoles[i] = Number.isFinite(c.nHoles) ? c.nHoles : 0; if (Number.isFinite(c.holeShare)) columns.holeShare[i] = c.holeShare; columns.support[i] = SUP[c.support] || 0; columns.beyond[i] = c.beyond === "above" ? 1 : c.beyond === "below" ? 2 : 0; columns.nearUnsampled[i] = c.nearUnsampled ? 1 : 0; // #2435; #2596
  });
  let worker = null, settle = null;
  const promise = new Promise((resolve, reject) => {
    settle = resolve;
    worker = new Worker(new URL("./pitSeries.worker.js", import.meta.url), { type: "module" });
    worker.onmessage = (e) => {
      if (e.data.progress) { onProgress?.(e.data.progress); return; }
      worker.terminate();
      if (e.data.failed) reject(new Error(e.data.failed)); else resolve(e.data.result);
    };
    worker.onerror = (e) => { e.preventDefault?.(); worker.terminate(); reject(new Error(e.message || "worker failed")); };
    const t = terrain ? { bbox: terrain.bbox, gridW: terrain.gridW, gridH: terrain.gridH, elevations: terrain.elevations, noDataMask: terrain.noDataMask } : null;
    const cl = !t && collars ? collars.filter((c) => [c.x, c.y, c.z].every(Number.isFinite)).map((c) => ({ x: c.x, y: c.y, z: c.z })) : null;
    const by = byModel ? byColumnsOf(byModel) : null; // #1917
    worker.postMessage({ inputs, rfs, rate, discountPct, columns, byColumns: by, terrain: t, collars: cl }, [...Object.values(columns).map((a) => a.buffer), ...(by ? Object.values(by).map((a) => a.buffer) : [])]);
  });
  return { promise, cancel: () => { worker?.terminate(); settle?.({ cancelled: true }); } };
}
