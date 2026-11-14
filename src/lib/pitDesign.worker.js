// TASKS.csv #1874 — the benched pit design off the UI thread: a few hundred thousand design cells and their contours
import { shellFloors, benchedPit } from "./pitDesign.js";
import { collarGround, modelTopGround, pitEconomics, joinByProduct, cellIsOre /* #3312 */, collarsLookUnderground, weatheredOf, joinAlso } from "./pitShell.js"; // joinAlso: #3084 // weatheredOf: #2671 // modelTopGround: #1850; // pitEconomics / joinByProduct / cellRevenue: #1917
import { terrainGroundAt } from "./viewer/geomath.js";

self.onmessage = (e) => {
  try {
    const { shellPositions, terrain, collars, columns: c, opts } = e.data;
    let cells = new Array(c ? c.value.length : 0);
    for (let i = 0; i < cells.length; i++) cells[i] = { x: c.x[i], y: c.y[i], z: c.z[i], dx: c.dx[i], dy: c.dy[i], dz: c.dz[i], value: c.value[i], coverage: c.coverage[i], ...(c.beyond?.[i] ? { beyond: c.beyond[i] === 1 ? "above" : "below" } : {}) /* #2645 */, ...(c.density?.[i] > 0 ? { density: c.density[i] } : {}) /* #2647 */, ...(c.nearUnsampled?.[i] ? { nearUnsampled: true } : {}) /* #2735 */ };
    // TASKS.csv #1917 — a shell priced with a by-product: a block is ore when its revenue over both metals pays the processing, as the shell decided
    const b = e.data.byColumns, eco = opts.economics ? pitEconomics(opts.economics) : null;
    if (b && eco?.by) cells = joinByProduct(cells, Array.from(b.value, (v, i) => ({ x: b.x[i], y: b.y[i], z: b.z[i], value: v }))).cells;
    // TASKS.csv #3084 — the shell's other grades (#2995) on the blocks, by centre, for the bench table
    if (e.data.alsoColumns?.length) cells = joinAlso(cells, e.data.alsoColumns.map((a) => ({ cells: Array.from(a.value, (v, i) => ({ x: a.x[i], y: a.y[i], z: a.z[i], value: v })) }))).cells;
    // the ore decision on every priced metal (the by-product, and the priced other grades: #3311), or the typed cut-off (#3312), as the shell
    if (eco && ((b && eco.by) || eco.alsoPriced)) cells = cells.map((cell) => ({ ...cell, ore: cellIsOre(cell, eco, opts.economics.processingCost) }));
    // TASKS.csv #2276 — not from underground collars (the design climbed to the three surface collars over a mine drilled from its levels)
    if (!terrain && collars?.length) { const ug = collarsLookUnderground(collars); if (ug.underground) { self.postMessage({ failed: "underground", underground: ug }); return; } }
    const groundAt = terrain ? (x, y) => terrainGroundAt(terrain, x, y) : collars ? collarGround(collars) : cells.length ? modelTopGround(cells) : null; // as the pit's run (#1353; the model's column tops, #1850)
    const shell = shellFloors(shellPositions, groundAt);
    if (!shell) { self.postMessage({ failed: "no-floors" }); return; }
    let last = 0;
    const r = benchedPit(shell, { ...opts, groundAt, cells, weathered: weatheredOf(opts.weathered) /* #2671 */, onPhase: (stage) => self.postMessage({ phases: { stage } }) /* #3002 */, onBench: (k, n) => { const t = Date.now(); if (t - last > 150) { last = t; self.postMessage({ phases: { k, n } }); } } }); // #2286 — the bench on the busy button
    if (!r) { self.postMessage({ failed: "no-design" }); return; }
    if (r.failed) { self.postMessage({ failed: r.failed }); return; } // #1916: "area-empty"
    r.groundSource = terrain ? "terrain" : collars ? "collars" : "model top";
    self.postMessage({ result: r }, [r.positions.buffer, r.indices.buffer]);
  } catch (err) {
    self.postMessage({ failed: String(err?.message || err) });
  }
};
