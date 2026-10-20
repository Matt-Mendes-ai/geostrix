// TASKS.csv #784 — fetching imagery for a spectral index: scene coverage of the area and the window grid.
import test from "node:test";
import assert from "node:assert/strict";
import { areaCoverage, windowGrid } from "../src/lib/imageryFetch.js";

test("coverage: a footprint covering the area, half of it, none, and no geometry", () => {
  const sq = (x0, y0, x1, y1) => ({ type: "Polygon", coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] });
  const area = [-130, 55, -129, 56];
  assert.equal(areaCoverage(sq(-131, 54, -128, 57), area), 1);
  assert.equal(areaCoverage(sq(-129.5, 54, -128, 57), area), 0.5);
  assert.equal(areaCoverage(sq(0, 0, 1, 1), area), 0);
  assert.equal(areaCoverage({ type: "MultiPolygon", coordinates: [sq(-131, 54, -129.5, 57).coordinates, sq(-129.5, 54, -128, 57).coordinates] }, area), 1);
  assert.equal(areaCoverage(null, area), 1);
});

test("window grid: the area in the scene's UTM zone, native cell for a small area, capped for a big one", () => {
  const small = windowGrid([-129.62, 55.62, -129.52, 55.68], 32609, 10);
  assert.equal(small.cell, 10);
  assert.ok(small.width > 600 && small.width < 700 && small.height > 640 && small.height < 700, `${small.width} x ${small.height}`);
  assert.ok(small.box[0] > 460000 && small.box[0] < 470000 && small.box[3] > 6160000 && small.box[3] < 6175000, small.box.join(","));
  const big = windowGrid([-130.5, 55.0, -129.0, 56.0], 32609, 10, 2000);
  assert.ok(Math.max(big.width, big.height) <= 2000);
  assert.ok(big.cell > 50, String(big.cell));
  assert.throws(() => windowGrid([-130, 55, -129, 56], 999999, 10), /not a CRS GeoStrix can project/);
});

import { s2Offset } from "../src/lib/imageryFetch.js";
test("Sentinel-2 offset: only for a baseline 04.00+ item not already harmonised", () => {
  assert.equal(s2Offset({ "s2:processing_baseline": "05.12", "earthsearch:boa_offset_applied": true }, -0.1), 0); // Earth Search 2026
  assert.equal(s2Offset({ "s2:processing_baseline": "03.01" }, -0.1), 0); // before the shift existed
  assert.equal(s2Offset({ "s2:processing_baseline": "04.00", "earthsearch:boa_offset_applied": false }, -0.1), -0.1);
  assert.equal(s2Offset({ "s2:processing_baseline": "05.10", "earthsearch:boa_offset_applied": false }, undefined), -0.1);
  assert.equal(s2Offset({}, -0.1), 0);
});
