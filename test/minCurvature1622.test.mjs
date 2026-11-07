// TASKS.csv #1622 — minimum-curvature gridding with tension, beside IDW for surface samples.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { minCurvatureGrid } from "../src/lib/minCurvature.js";
import { gridSamples, MINCURV_MAX_CELLS } from "../src/lib/sampleGrid.js";

const plane = (x, y) => 0.02 * x + 0.03 * y;
const planePts = (nx, ny, cell, step = 50) => { const pts = []; for (let x = 5; x < nx * cell; x += step) for (let y = 5; y < ny * cell; y += step) pts.push({ x, y, v: plane(x, y) }); return pts; };

test("tension 0: a plane through the samples comes back exactly, across coarse-to-fine levels", () => {
  for (const [nx, ny] of [[40, 30], [130, 90]]) {
    const cell = 10, ymax = ny * cell, r = minCurvatureGrid(planePts(nx, ny, cell), { xmin: 0, ymax, cell, nx, ny }, { tension: 0 });
    let err = 0;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) err = Math.max(err, Math.abs(r.values[j * nx + i] - plane((i + 0.5) * cell, ymax - (j + 0.5) * cell)));
    assert.ok(err < 1e-3, `${nx}x${ny}: ${err}`);
    if (nx > 64) assert.ok(r.levels >= 2);
  }
});

test("through every sample; more tension, less overshoot below the background", () => {
  const pts = [];
  for (let x = 5; x < 600; x += 50) for (let y = 5; y < 600; y += 50) pts.push({ x, y, v: 1 });
  pts.find((p) => p.x === 305 && p.y === 305).v = 10;
  const mins = [0, 0.25, 0.75].map((T) => {
    const r = minCurvatureGrid(pts, { xmin: 0, ymax: 600, cell: 10, nx: 60, ny: 60 }, { tension: T });
    const at = (x, y) => r.values[Math.round((600 - y) / 10 - 0.5) * 60 + Math.round(x / 10 - 0.5)];
    assert.ok(Math.abs(at(305, 305) - 10) < 1e-4 && Math.abs(at(55, 55) - 1) < 1e-4);
    assert.ok(at(335, 305) > 1 && at(335, 305) < 10, "between the high and the background");
    return Math.min(...r.values);
  });
  assert.ok(mins[0] < mins[1] && mins[1] < mins[2], JSON.stringify(mins));
  assert.ok(mins[2] > 0.99, "a near-membrane barely dips below the background");
});

test("gridSamples: method mincurv on log10 values, back in the unit, the IDW blanking kept, the cell cap", () => {
  const samples = [];
  for (let x = 0; x <= 400; x += 50) for (let y = 0; y <= 300; y += 50) samples.push({ x, y, medium: "soil", values: { Au: x === 200 && y === 150 ? 1.2 : 0.01 } });
  samples.push({ x: 5000, y: 5000, medium: "soil", values: { Au: 0.01 } }); // far: a blank gap between
  const r = gridSamples(samples, "Au", { log: true, cellM: 25, blankM: 120, method: "mincurv", tension: 0.25 });
  assert.equal(r.method, "mincurv");
  const g = r.grid, at = (x, y) => g.values[Math.round((g.yTop - y) / g.dy) * g.nx + Math.round((x - g.x0) / g.dx)];
  assert.ok(Math.abs(at(200, 150) - 1.2) < 1e-3, "the high sample's node keeps 1.2 ppm");
  assert.ok(Math.abs(at(0, 0) - 0.01) < 1e-4);
  assert.ok(Number.isNaN(at(2500, 2500)), "blank far from every sample");
  const idw = gridSamples(samples, "Au", { log: true, cellM: 25, blankM: 120 });
  assert.equal(r.valid, idw.valid, "same cells have a value as with IDW");
  const big = gridSamples([{ x: 0, y: 0, values: { Au: 1 } }, { x: 30000, y: 0, values: { Au: 2 } }, { x: 0, y: 30000, values: { Au: 3 } }], "Au", { cellM: 20, method: "mincurv" });
  assert.equal(big.error, "mincurvCells");
  assert.ok(big.nx * big.ny > MINCURV_MAX_CELLS);
});

test("the panel offers the method, tension in place of power, and names the raster by method", () => {
  const p = readFileSync(new URL("../src/components/SampleGridPanel.jsx", import.meta.url), "utf8");
  assert.match(p, /<option value="mincurv">\{tr\("Minimum curvature"\)\}<\/option>/);
  assert.match(p, /method === "mincurv"\s*\? <label style=\{lbl\}>\{tr\("Tension"\)\}/);
  assert.match(p, /`min\. curvature T\$\{tension\}`/);
});
