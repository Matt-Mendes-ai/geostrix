// TASKS.csv #3085 — the layer-cake stack (lib/layerCake.js) off the UI thread: its grids blocked the window 2.8-3.8 s on WA iron's 228-hole
// block. Same function, so the result is identical; progress after each top's grid.
import { layerCake } from "./layerCake.js";

self.onmessage = ({ data: { id, specs, extent, resolution, evalPts } }) => {
  try {
    const r = layerCake(specs, extent, resolution, { evalPts, onProgress: (done, total) => self.postMessage({ id, progress: [done, total] }) });
    if (r.error) { self.postMessage({ id, failed: r.error }); return; }
    self.postMessage({ id, res: { surfaces: r.surfaces, block: r.block, evaluated: r.evaluated, grid: r.grid, report: r.report } }, [r.block.ids.buffer]);
  } catch (err) {
    self.postMessage({ id, failed: String(err?.message || err) });
  }
};
