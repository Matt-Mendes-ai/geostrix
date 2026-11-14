// TASKS.csv #3470 — Clip to boundary makes a new raster: the cells inside a polygon, cropped to it, the rest no-data
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { clipGridToPolygon } from "../src/lib/clipGrid.js";
import { f32ToB64 } from "../src/lib/inversion.js";

const nx = 10, ny = 10, values = new Float32Array(nx * ny);
for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) values[j * nx + i] = j * 10 + i;
const grid = { nx, ny, x0: 50, yTop: 950, dx: 100, dy: 100, values };
const sq = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }, { x: x0, y: y0 }];

test("a square over columns 2-4 and rows 3-7 gives a 3 x 5 grid at the right place with the right values", () => {
  const c = clipGridToPolygon(grid, [sq(200, 300, 500, 800)]); // centres 250, 350, 450 E; 750 ... 350 N (rows 2-6 from the north)
  assert.deepEqual([c.nx, c.ny, c.x0, c.yTop, c.kept, c.total], [3, 5, 250, 750, 15, 15]);
  assert.equal(c.values[0], 2 * 10 + 2); // row 2, column 2 of the source
  assert.equal(c.values[c.nx * c.ny - 1], 6 * 10 + 4);
});

test("cells outside the polygon (a hole, a no-data cell) are NaN and not counted as kept; the base64 grid reads the same", () => {
  const v = new Float32Array(values); v[2 * nx + 2] = NaN;
  const c = clipGridToPolygon({ ...grid, values: f32ToB64(v) }, [sq(200, 300, 500, 800), sq(300, 400, 400, 500)]);
  assert.deepEqual([c.total, c.kept], [14, 13]);
  assert.ok(Number.isNaN(c.values[0]));
  assert.ok(Number.isNaN(c.values[3 * c.nx + 1])); // the hole: the cell at 350 E, 450 N is source column 3, row 5, so column 1, row 3 of the crop
});

test("a polygon off the grid gives none; the raster card offers it and makes a new raster, the original unchanged", () => {
  assert.equal(clipGridToPolygon(grid, [sq(5000, 5000, 6000, 6000)]), null);
  const m = readFileSync(new URL("../src/modules/RasterModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(m, /onClip=\{\(b\) => clipRasterTo\(r, b\)\}/);
  assert.match(m, /name: `\$\{r\.name\} — inside \$\{b\.name\}`/);
  assert.match(m, /clippedTo: \{ boundary: b\.name, source: r\.name \}/);
});
