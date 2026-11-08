// TASKS.csv #2122 (review #2013, Woodjam) — a point shapefile is refused as a boundary or a claim (with where points go), and a file of
// open lines is refused as a claim (a claim is an area).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { vectorToBoundaryPolylines } from "../src/lib/boundaryImport.js";
const g = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("points give no polylines; lines give open ones; polygons closed ones", async () => {
  const pts = await vectorToBoundaryPolylines({ geomType: "point", features: [{ geometry: [[1, 2]] }, { geometry: [[3, 4]] }] }, null);
  assert.equal(pts.polylines.length, 0);
  const lines = await vectorToBoundaryPolylines({ geomType: "line", features: [{ geometry: [[0, 0], [10, 0]] }] }, null);
  assert.deepEqual(lines.closedFlags, [false]);
  const poly = await vectorToBoundaryPolylines({ geomType: "polygon", features: [{ geometry: [[0, 0], [10, 0], [10, 10], [0, 0]] }] }, null);
  assert.deepEqual(poly.closedFlags, [true]);
});

test("the module refuses them with a reason", () => {
  assert.match(g, /if \(!r\.polylines\.length\) throw new Error\(parsed\.geomType === "point"/);
  assert.match(g, /it holds points, not lines or polygons: import collars in the 3D View/);
  assert.match(g, /every\(\(p\) => p\.closedFlags\?\.length && p\.closedFlags\.every\(\(f\) => !f\)\)\) throw new Error\(tr\("it holds open lines, not polygons: a claim is an area\. Import it as a boundary\."\)\);/);
});
