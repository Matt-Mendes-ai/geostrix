// TASKS.csv #2880 (split from #2820) — the Grade x thickness plan grid out: GT, thickness and (kriging) their standard deviations per node, as CSV
// or GeoTIFF bands.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { planGridRows, planGridBands } from "../src/lib/planGridExport.js";
import { gridToGeoTIFF } from "../src/lib/gridExport.js";
import { planGrid } from "../src/lib/accumulation.js";
import { fromArrayBuffer } from "geotiff";

// 3 x 2 nodes of 50 m from (1000, 2000), j = 0 the south row; one node with no estimate
const grid = { nx: 3, ny: 2, x0: 1000, y0: 2000, cell: 50, gt: Float64Array.from([10, 20, NaN, 40, 50, 60]), thickness: Float64Array.from([1, 2, NaN, 4, 5, 6]), sdGT: Float64Array.from([0, 1, NaN, 3, 4, 5]), sdTh: Float64Array.from([0, 0.1, NaN, 0.3, 0.4, 0.5]) };

test("planGridRows: the estimated nodes at their coordinates; standard deviations only with kriging", () => {
  const rows = planGridRows(grid, "gt_g_t");
  assert.equal(rows.length, 5);
  assert.deepEqual(rows[0], { x: 1000, y: 2000, gt_g_t: 10, thickness_m: 1, gt_sd: 0, thickness_sd: 0 });
  assert.deepEqual(rows[4], { x: 1100, y: 2050, gt_g_t: 60, thickness_m: 6, gt_sd: 5, thickness_sd: 0.5 });
  assert.ok(rows.every((r) => r.gt_g_t !== undefined));
  const idw = planGridRows({ ...grid, sdGT: undefined, sdTh: undefined });
  assert.deepEqual(Object.keys(idw[0]), ["x", "y", "gt", "thickness_m"]);
  assert.deepEqual(planGridRows(null), []);
});

test("planGridBands: row 0 is north, the first cell's centre is the south-west node's column and the north row's y", () => {
  const g = planGridBands(grid);
  assert.deepEqual([g.nx, g.ny, g.x0, g.yTop, g.dx, g.dy], [3, 2, 1000, 2050, 50, 50]);
  assert.deepEqual(g.bands.map((b) => b.name), ["GT", "thickness_m", "GT kriging standard deviation", "thickness kriging standard deviation"]);
  assert.deepEqual([...g.bands[0].values].map((v) => (Number.isNaN(v) ? "nd" : v)), [40, 50, 60, 10, 20, "nd"], "the north row first");
  assert.equal(planGridBands({ ...grid, sdGT: undefined, sdTh: undefined }).bands.length, 2);
  assert.equal(planGridBands(null), null);
});

test("the GeoTIFF reads back: the bands, the north row first, no data where there is no estimate, the origin and size", async () => {
  const g = planGridBands(grid);
  const img = await (await fromArrayBuffer(gridToGeoTIFF({ ...g, epsg: 28351 }))).getImage();
  assert.deepEqual([img.getWidth(), img.getHeight(), img.getSamplesPerPixel()], [3, 2, 4]);
  // pixel (0,0)'s outer corner: the first centre moved half a cell west and north
  assert.deepEqual(img.getOrigin().slice(0, 2), [1000 - 25, 2050 + 25]);
  assert.deepEqual(img.getResolution().slice(0, 2), [50, -50]);
  const data = await img.readRasters({ interleave: true });
  const px = (row, col, band) => data[(row * 3 + col) * 4 + band];
  assert.deepEqual([px(0, 0, 0), px(0, 1, 0), px(0, 2, 0), px(1, 0, 0), px(1, 1, 0)], [40, 50, 60, 10, 20], "GT, north row first");
  assert.equal(px(1, 2, 0), -9999, "the node with no estimate is no data");
  assert.equal(px(0, 0, 1), 4); assert.ok(Math.abs(px(0, 2, 3) - 0.5) < 1e-6);
});

test("a real plan grid goes through the GeoTIFF writer", () => {
  const pts = [{ x: 0, y: 0, gt: 5, thicknessM: 2 }, { x: 100, y: 0, gt: 9, thicknessM: 3 }, { x: 50, y: 80, gt: 7, thicknessM: 2.5 }];
  const g = planGrid(pts, { cell: 20, radius: 90, pad: 40 });
  const b = planGridBands(g);
  const tif = gridToGeoTIFF({ ...b, epsg: 28351 });
  assert.ok(tif.byteLength > b.nx * b.ny * 4 * 2);
  assert.equal(planGridRows(g).length, g.estimated);
});

test("wiring: the two buttons under a plan grid, the CRS, the message; keys", () => {
  const m = readFileSync(new URL("../src/components/GradeThicknessModal.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(m, /\{grid && <div style=\{\{ display: "flex", gap: 8, flexWrap: "wrap" \}\}>\{\/\* #2880 \*\/\}/);
  assert.match(m, /gridToGeoTIFF\(\{ \.\.\.g, epsg: project\?\.epsg \}\)/);
  assert.match(m, /const \{ desurveyMethod, addMapLayer, project \} = useStore\(\);/);
  const keys = ["Export the plan grid (CSV)", "Export the plan grid (GeoTIFF)", "GT, thickness and, with kriging, their standard deviations, one band each, in the project's CRS", "GeoTIFF of the plan grid: {n} bands in this order: {names}; {nx} × {ny} nodes of {c} m, no data where no hole is in reach."];
  for (const l of ["es", "pt", "fr", "ar"]) { const d = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8")); for (const k of keys) assert.ok(d[k], `${l}: ${k}`); }
});
