// TASKS.csv #3420 — 'every N m between … and …': a grid per level of a 3D cloud in one go
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { levelSlices, inLevel } from "../src/lib/surveyGridDefaults.js";

test("#3420 the windows tile the range: every z falls in exactly one, the top included", () => {
  const w = levelSlices(0, 100, 25);
  assert.deepEqual(w.map((x) => [x.lo, x.hi]), [[0, 25], [25, 50], [50, 75], [75, 100]]);
  for (const z of [0, 24.9, 25, 74.99, 75, 100]) assert.equal(w.filter((x) => inLevel(z, x)).length, 1, String(z));
  assert.equal(w.filter((x) => inLevel(100.01, x)).length, 0); assert.equal(w.filter((x) => inLevel(-0.01, x)).length, 0);
  // a range that is not a multiple of the step: the last window is shorter and closed at the top
  const u = levelSlices(-445, 1278, 100);
  assert.equal(u.length, 18); assert.deepEqual([u[0].lo, u[0].hi, u[17].lo, u[17].hi], [-445, -345, 1255, 1278]);
  assert.equal(u.filter((x) => inLevel(1278, x)).length, 1);
});

test("#3420 a bad range or step gives null; the set is capped", () => {
  assert.equal(levelSlices(10, 10, 5), null); assert.equal(levelSlices(0, 100, 0), null); assert.equal(levelSlices(NaN, 5, 1), null);
  assert.equal(levelSlices(0, 10000, 1).length, 40);
});

test("#3420 the pane offers it for a 3D cloud with IDW and adds one raster per level", () => {
  const g = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(g, /const makeLevelGrids = \(\) => \{/);
  assert.match(g, /\{idwShape\?\.is3D && idwMethod === "idw" && \( \/\/ TASKS\.csv #3420/);
  assert.match(g, /tool: "IDW gridding \(level set\)"/);
  assert.match(g, /if \(pts\.length < 3 \|\| pointsAlongOneLine\(pts, idwCellSize\)\) \{ skipped\+\+; continue; \}/);
});
