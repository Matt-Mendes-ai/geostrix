// TASKS.csv #3113 (from #2921, review #2876 WA iron) — the thickness (isopach) grid between two explicit tops of one pile: the next top
// under a top, from the holes' order; the vertical distance per map cell as a raster; the volume over the overlap and inside both
// surfaces' inputs' hulls.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isopachBetween } from "../src/lib/isopach.js";
import { lowerNeighbour, upperNeighbour, pileFromRuns } from "../src/lib/pileTops.js";

// a plane z = a + b x + c y as a grid mesh over [x0, x1] x [y0, y1] (world E, N, Z)
function plane(x0, x1, y0, y1, n, z) {
  const P = [], I = [];
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) { const x = x0 + ((x1 - x0) * i) / n, y = y0 + ((y1 - y0) * j) / n; P.push(x, y, z(x, y)); }
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const a = j * (n + 1) + i; I.push(a, a + 1, a + n + 2, a, a + n + 2, a + n + 1); }
  return { positions: Float64Array.from(P), indices: Uint32Array.from(I) };
}
// a hull in a flat frame (e1 = east, e2 = north): the plan rectangle
const rectHull = (x0, x1, y0, y1) => ({ origin: [0, 0, 0], e1: [1, 0, 0], e2: [0, 1, 0], uv: [x0, y0, x1, y0, x1, y1, x0, y1] });

test("a wedge: the thickness per cell, the volume over the overlap and inside both hulls, the raster layout", () => {
  const up = { ...plane(1000, 2000, 5000, 5800, 20, (x) => 400 + (x - 1000) * 0.01), hull: rectHull(1200, 1800, 5000, 5800) };
  const lo = { ...plane(1100, 2100, 5000, 5800, 20, () => 395), hull: rectHull(1000, 1500, 5000, 5800) };
  const r = isopachBetween(up, lo, { cellM: 10 });
  assert.equal(r.grid.nx, 90); assert.equal(r.grid.ny, 80); // the overlap 1100-2000 x 5000-5800
  assert.equal(r.grid.x0, 1105); assert.equal(r.grid.yTop, 5795); // cell centres
  assert.deepEqual(r.bbox, [1100, 5000, 2000, 5800]);
  assert.equal(r.cells, 7200);
  // thickness 5 + (x - 1000) * 0.01: at the first column 6.05, at the last 14.95
  assert.ok(Math.abs(r.grid.values[0] - 6.05) < 1e-4 && Math.abs(r.grid.values[89] - 14.95) < 1e-4);
  assert.ok(Math.abs(r.min - 6.05) < 1e-4 && Math.abs(r.max - 14.95) < 1e-4 && Math.abs(r.mean - 10.5) < 1e-4);
  // the volume: mean 10.5 m over 900 x 800 m
  assert.ok(Math.abs(r.volumeM3 - 10.5 * 900 * 800) < 1);
  // inside both hulls: x 1200-1500 (30 columns, mean thickness 8.5 m)
  assert.equal(r.supported.cells, 30 * 80);
  assert.ok(Math.abs(r.supported.volumeM3 - 8.5 * 300 * 800) < 1);
  assert.equal(r.negativeCells, 0);
});

test("crossing tops: negative cells counted and kept, left out of the volume; no hull known; no overlap; the cell cap", () => {
  const up = plane(0, 100, 0, 100, 10, (x) => 10 + x * 0.1), lo = plane(0, 100, 0, 100, 10, () => 15); // the lower above the upper for x < 50
  const r = isopachBetween(up, lo, { cellM: 10 });
  assert.equal(r.negativeCells, 50);
  assert.ok(r.min < 0 && r.grid.values[0] < 0, "kept as a negative thickness");
  assert.ok(Math.abs(r.volumeM3 - [0.5, 1.5, 2.5, 3.5, 4.5].reduce((s, t) => s + t * 1000, 0)) < 1e-6);
  assert.equal(r.supported, null, "no hull known");
  assert.equal(isopachBetween(up, plane(200, 300, 0, 100, 4, () => 0)), null, "no overlap in plan");
  const big = isopachBetween(up, lo, { cellM: 0.01, maxCells: 10000 });
  assert.ok(big.coarsened && big.grid.nx * big.grid.ny <= 10000);
  // the default cell: the coarser surface's vertex spacing
  assert.ok(Math.abs(isopachBetween(up, plane(0, 100, 0, 100, 4, () => 0)).cellM - Math.sqrt(10000 / 25)) < 1e-9);
});

test("the next top down from the holes' order: the closest under, the mirror of the next top up", () => {
  const runs = [];
  for (let h = 0; h < 6; h++) ["A", "B", "C", "D"].forEach((u, k) => runs.push({ hole_id: `H${h}`, code: u, from: k * 5 }));
  const pile = pileFromRuns(runs);
  const cands = ["A", "B", "C", "D"].map((u) => ({ unit: u, id: u }));
  assert.equal(lowerNeighbour(pile, "A", cands).unit, "B");
  assert.equal(lowerNeighbour(pile, "B", cands.filter((c) => c.unit !== "C")).unit, "D");
  assert.equal(lowerNeighbour(pile, "D", cands), null);
  assert.equal(upperNeighbour(pile, "C", cands).unit, "B");
});

test("wiring: the pane's button, the raster, the keys", () => {
  const p = readFileSync(new URL("../src/components/ExplicitSurfacePanel.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(p, /const pileBase = useMemo\(/);
  assert.match(p, /isopachBetween\(/);
  assert.match(p, /addRaster\(\{/);
  // the scene mesh back to world E, N, Z: the inverse of upsertMesh's (x - o.x, z - o.z, o.y - y)
  assert.match(p, /pos\[i\] = P\[i\] - o\.x; pos\[i \+ 1\] = P\[i \+ 2\] - o\.z; pos\[i \+ 2\] = o\.y - P\[i \+ 1\];/);
  assert.match(p, /q\[i\] = a\[i\] \+ o\.x; q\[i \+ 1\] = o\.y - a\[i \+ 2\]; q\[i \+ 2\] = a\[i \+ 1\] \+ o\.z;/);
  assert.match(p, /hull: \(surfaces \|\| \[\]\)\.find\(\(x\) => x\.id === sid\)\?\.params\?\.supportHull/);
  for (const l of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"));
    for (const k of ["Thickness map down to {lower}"]) assert.ok(d[k], `${l}: ${k}`);
  }
});
