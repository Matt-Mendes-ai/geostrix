// TASKS.csv #1874 — the benched pit design off the UI thread: a few hundred thousand design cells and their contours
import { shellFloors, benchedPit } from "./pitDesign.js";
import { collarGround } from "./pitShell.js";
import { terrainGroundAt } from "./viewer/geomath.js";

self.onmessage = (e) => {
  try {
    const { shellPositions, terrain, collars, columns: c, opts } = e.data;
    const cells = new Array(c ? c.value.length : 0);
    for (let i = 0; i < cells.length; i++) cells[i] = { x: c.x[i], y: c.y[i], z: c.z[i], dx: c.dx[i], dy: c.dy[i], dz: c.dz[i], value: c.value[i], coverage: c.coverage[i] };
    const groundAt = terrain ? (x, y) => terrainGroundAt(terrain, x, y) : collars ? collarGround(collars) : null; // as the pit's run (#1353)
    const shell = shellFloors(shellPositions, groundAt);
    if (!shell) { self.postMessage({ failed: "no-floors" }); return; }
    const r = benchedPit(shell, { ...opts, groundAt, cells });
    if (!r) { self.postMessage({ failed: "no-design" }); return; }
    r.groundSource = terrain ? "terrain" : collars ? "collars" : "model top";
    self.postMessage({ result: r }, [r.positions.buffer, r.indices.buffer]);
  } catch (err) {
    self.postMessage({ failed: String(err?.message || err) });
  }
};
