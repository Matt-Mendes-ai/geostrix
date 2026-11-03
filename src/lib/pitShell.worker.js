// TASKS.csv #1341 — the pit solve off the UI thread: seconds at 200,000 blocks on a fast machine, several times that on a budget laptop.
import { runPitShell } from "./pitShell.js";
import { terrainGroundAt } from "./viewer/geomath.js";

self.onmessage = (e) => {
  try {
    const { inputs, columns: c, terrain } = e.data;
    const cells = new Array(c.value.length);
    for (let i = 0; i < cells.length; i++) cells[i] = { x: c.x[i], y: c.y[i], z: c.z[i], dx: c.dx[i], dy: c.dy[i], dz: c.dz[i], value: c.value[i], coverage: c.coverage[i] };
    const r = runPitShell({ ...inputs, cells }, { groundAt: terrain ? (x, y) => terrainGroundAt(terrain, x, y) : null, onProgress: (phases) => self.postMessage({ phases }) });
    self.postMessage({ result: r }, r.positions ? [r.positions.buffer, r.indices.buffer] : []);
  } catch (err) {
    self.postMessage({ failed: String(err?.message || err) });
  }
};
