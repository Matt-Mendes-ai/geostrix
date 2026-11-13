// TASKS.csv #2279 (review #2174, WA gold) — stope outlines off the UI thread: 1-3 s of frozen window on a 168k-block model under load.
import { joinAlso } from "./pitShell.js"; // TASKS.csv #3084
import { stopeOutlines } from "./stopeOutlines.js";
import { ceilingLookup } from "./pitCeiling.js";

self.onmessage = (e) => {
  try {
    const { columns: c, opts, ceiling, ground } = e.data; // ground: #2438, a grid as the ceiling's
    let cells = new Array(c.value.length);
    for (let i = 0; i < cells.length; i++) cells[i] = { x: c.x[i], y: c.y[i], z: c.z[i], dx: c.dx[i], dy: c.dy[i], dz: c.dz[i], value: c.value[i], coverage: c.coverage[i] };
    const ceilingAt = ceiling ? ceilingLookup(ceiling.values, ceiling.frame) : null;
    let last = 0;
    const groundAt = ground ? ceilingLookup(ground.values, ground.frame) : null;
    if (e.data.alsoColumns?.length) cells = joinAlso(cells, e.data.alsoColumns.map((a) => ({ cells: Array.from(a.value, (v, i) => ({ x: a.x[i], y: a.y[i], z: a.z[i], value: v })) }))).cells; // #3084
    const r = stopeOutlines({ cells }, { ...opts, ceilingAt, groundAt, onLevel: (k, n) => { const t = Date.now(); if (t - last > 150 || k === n) { last = t; self.postMessage({ level: k, levels: n }); } } });
    self.postMessage({ result: r });
  } catch (err) {
    self.postMessage({ failed: String(err?.message || err) });
  }
};
