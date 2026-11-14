// TASKS.csv #2002 — zonal statistics of a raster over a polygon, by cell-centre sampling
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { zonalStats } from "../src/lib/zonalStats.js";
import { f32ToB64 } from "../src/lib/inversion.js";

// a 10 x 10 grid of 100 m cells, centres at 50, 150 ... 950 E and 950 ... 50 N; the value of a cell is its column index (0-9)
const nx = 10, ny = 10, values = new Float32Array(nx * ny);
for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) values[j * nx + i] = i;
const grid = { nx, ny, x0: 50, yTop: 950, dx: 100, dy: 100, values };
const sq = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }, { x: x0, y: y0 }];

test("a square over columns 2-4 and rows 3-7 holds 15 cells; mean 3, range 2-4, 15 x 1 ha", () => {
  const s = zonalStats(grid, [sq(200, 300, 500, 800)]); // centres 250, 350, 450 E; 350 ... 750 N
  assert.deepEqual([s.cells, s.count, s.mean, s.min, s.max, s.p50], [15, 15, 3, 2, 4, 3]);
  assert.equal(s.areaHa, 15);
  assert.equal(s.coverage, 1);
});

test("no-data cells are left out of the statistics but counted in the zone; a hole is not inside; the base64 grid reads the same", () => {
  const v = new Float32Array(values); v[3 * nx + 2] = NaN; // one NaN inside the square
  const s = zonalStats({ ...grid, values: f32ToB64(v) }, [sq(200, 300, 500, 800)]);
  assert.deepEqual([s.cells, s.count], [15, 14]);
  assert.ok(Math.abs(s.coverage - 14 / 15) < 1e-9);
  const holed = zonalStats(grid, [sq(200, 300, 500, 800), sq(300, 400, 400, 500)]); // the cell at 350 E, 450 N is a hole
  assert.equal(holed.cells, 14);
});

test("a polygon off the grid has no cells; a boundary with nothing, none", () => {
  assert.equal(zonalStats(grid, [sq(5000, 5000, 6000, 6000)]), null);
  assert.equal(zonalStats(grid, []), null);
});

test("the raster card offers it for any gridded raster", () => {
  const m = readFileSync(new URL("../src/modules/RasterModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(m, /\{r\.grid && <ZonalStatsBox raster=\{r\} boundaries=\{boundaries\} \/>\}/);
});
