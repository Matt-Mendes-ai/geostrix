// TASKS.csv #1341 — the pit solve off the UI thread: seconds at 200,000 blocks on a fast machine, several times that on a budget laptop.
import { runPitShell } from "./pitShell.js";
import { terrainGroundAt } from "./viewer/geomath.js";

self.onmessage = (e) => {
  try {
    const { inputs, columns: c, terrain, collars } = e.data;
    const cells = new Array(c.value.length);
    const SUP = ["", "interpolated", "extrapolated", "unsupported"];
    for (let i = 0; i < cells.length; i++) cells[i] = { x: c.x[i], y: c.y[i], z: c.z[i], dx: c.dx[i], dy: c.dy[i], dz: c.dz[i], value: c.value[i], coverage: c.coverage[i], nHoles: c.nHoles[i], holeShare: c.holeShare ? c.holeShare[i] : NaN /* #1617 */, support: SUP[c.support[i]], beyond: c.beyond?.[i] === 1 ? "above" : c.beyond?.[i] === 2 ? "below" : undefined /* #2435 */, nearUnsampled: c.nearUnsampled?.[i] === 1 /* #2596 */, ...(c.density?.[i] > 0 ? { density: c.density[i] } : {}) /* #2647 */ }; // nHoles / support: #1354
    const b = e.data.byColumns, byCells = b ? Array.from(b.value, (v, i) => ({ x: b.x[i], y: b.y[i], z: b.z[i], value: v })) : null; // #1917
    const r = runPitShell({ ...inputs, cells, byCells }, { groundAt: terrain ? (x, y) => terrainGroundAt(terrain, x, y) : null, collars, onProgress: (phases) => self.postMessage({ phases }) }); // collars: #1353
    self.postMessage({ result: r }, r.positions ? [r.positions.buffer, r.indices.buffer] : []);
  } catch (err) {
    self.postMessage({ failed: String(err?.message || err) });
  }
};
