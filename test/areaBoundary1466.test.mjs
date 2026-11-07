// TASKS.csv #1466 — contour lines were offered as areas: the terrain / imagery fetch lists ('Boundary: soils 50 m' x 28) and Select by
// location. A boundary is an area only with a closed ring, and a contour layer never is.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isAreaBoundary } from "../src/lib/boundaryImport.js";

const sq = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];

test("claims and polygons are areas; open lines and contours are not", () => {
  assert.equal(isAreaBoundary({ polylines: [sq] }), true); // an old boundary with no flags: drawn closed (#408)
  assert.equal(isAreaBoundary({ polylines: [sq], closedFlags: [true] }), true);
  assert.equal(isAreaBoundary({ polylines: [sq], closedFlags: [false] }), false); // a stream, a survey line
  assert.equal(isAreaBoundary({ polylines: [sq, sq], closedFlags: [false, true] }), true);
  assert.equal(isAreaBoundary({ polylines: [sq], closedFlags: [true], contourLevels: [1400] }), false); // a closed contour loop
  assert.equal(isAreaBoundary({ polylines: [[{ x: 0, y: 0 }, { x: 1, y: 1 }]] }), false);
  assert.equal(isAreaBoundary(null), false);
});

test("the terrain and imagery area lists and Select by location use it", () => {
  const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
  for (const p of ["../src/modules/GeophysicsModule.jsx", "../src/modules/RasterModule.jsx"]) assert.match(read(p), /if \(!isAreaBoundary\(b\)\) continue; \/\/ #1466/, p);
  assert.match(read("../src/modules/ViewerModule.jsx"), /\{boundaries\.filter\(isAreaBoundary\)\.map\(\(b\) => <option key=\{b\.id\} value=\{b\.id\}>/);
});
