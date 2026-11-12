// TASKS.csv #1874 — the benched pit design off the UI thread: a few hundred thousand design cells and their contours
import { shellFloors, benchedPit } from "./pitDesign.js";
import { collarGround, modelTopGround, pitEconomics, joinByProduct, cellRevenue, collarsLookUnderground } from "./pitShell.js"; // modelTopGround: #1850; // pitEconomics / joinByProduct / cellRevenue: #1917
import { terrainGroundAt } from "./viewer/geomath.js";

self.onmessage = (e) => {
  try {
    const { shellPositions, terrain, collars, columns: c, opts } = e.data;
    let cells = new Array(c ? c.value.length : 0);
    for (let i = 0; i < cells.length; i++) cells[i] = { x: c.x[i], y: c.y[i], z: c.z[i], dx: c.dx[i], dy: c.dy[i], dz: c.dz[i], value: c.value[i], coverage: c.coverage[i], ...(c.beyond?.[i] ? { beyond: c.beyond[i] === 1 ? "above" : "below" } : {}) /* #2645 */, ...(c.density?.[i] > 0 ? { density: c.density[i] } : {}) /* #2647 */ };
    // TASKS.csv #1917 — a shell priced with a by-product: a block is ore when its revenue over both metals pays the processing, as the shell decided
    const b = e.data.byColumns, eco = opts.economics ? pitEconomics(opts.economics) : null;
    if (b && eco?.by) { const j = joinByProduct(cells, Array.from(b.value, (v, i) => ({ x: b.x[i], y: b.y[i], z: b.z[i], value: v }))); cells = j.cells.map((cell) => ({ ...cell, ore: cellRevenue(cell, eco) > opts.economics.processingCost })); }
    // TASKS.csv #2276 — not from underground collars (the design climbed to the three surface collars over a mine drilled from its levels)
    if (!terrain && collars?.length) { const ug = collarsLookUnderground(collars); if (ug.underground) { self.postMessage({ failed: "underground", underground: ug }); return; } }
    const groundAt = terrain ? (x, y) => terrainGroundAt(terrain, x, y) : collars ? collarGround(collars) : cells.length ? modelTopGround(cells) : null; // as the pit's run (#1353; the model's column tops, #1850)
    const shell = shellFloors(shellPositions, groundAt);
    if (!shell) { self.postMessage({ failed: "no-floors" }); return; }
    let last = 0;
    const r = benchedPit(shell, { ...opts, groundAt, cells, onBench: (k, n) => { const t = Date.now(); if (t - last > 150) { last = t; self.postMessage({ phases: { k, n } }); } } }); // #2286 — the bench on the busy button
    if (!r) { self.postMessage({ failed: "no-design" }); return; }
    if (r.failed) { self.postMessage({ failed: r.failed }); return; } // #1916: "area-empty"
    r.groundSource = terrain ? "terrain" : collars ? "collars" : "model top";
    self.postMessage({ result: r }, [r.positions.buffer, r.indices.buffer]);
  } catch (err) {
    self.postMessage({ failed: String(err?.message || err) });
  }
};
