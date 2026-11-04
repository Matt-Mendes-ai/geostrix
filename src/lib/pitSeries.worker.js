// TASKS.csv #1875 — the nested-pit series off the UI thread: one solve per revenue factor on a shared grid, then the schedule
import { runPitSeries } from "./pitShell.js";
import { terrainGroundAt } from "./viewer/geomath.js";

self.onmessage = (e) => {
  try {
    const { inputs, rfs, rate, discountPct, columns: c, terrain, collars } = e.data;
    const cells = new Array(c.value.length);
    const SUP = ["", "interpolated", "extrapolated", "unsupported"];
    for (let i = 0; i < cells.length; i++) cells[i] = { x: c.x[i], y: c.y[i], z: c.z[i], dx: c.dx[i], dy: c.dy[i], dz: c.dz[i], value: c.value[i], coverage: c.coverage[i], nHoles: c.nHoles[i], support: SUP[c.support[i]] };
    const b = e.data.byColumns, byCells = b ? Array.from(b.value, (v, i) => ({ x: b.x[i], y: b.y[i], z: b.z[i], value: v })) : null; // #1917
    const r = runPitSeries({ ...inputs, cells, byCells }, rfs, { groundAt: terrain ? (x, y) => terrainGroundAt(terrain, x, y) : null, collars, rate, discountPct, onProgress: (p) => self.postMessage({ progress: p }) });
    const transfer = [];
    (r.runs || []).forEach((run) => { if (run.positions) transfer.push(run.positions.buffer, run.indices.buffer); });
    self.postMessage({ result: r }, transfer);
  } catch (err) {
    self.postMessage({ failed: String(err?.message || err) });
  }
};
