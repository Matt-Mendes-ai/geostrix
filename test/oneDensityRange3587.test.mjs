// TASKS.csv #3587 (Main's heads-up: a branch had moved the tonnage tools' range to 1-8 while Data QC stayed 1-6) — ONE density range: the project's (default 1-6, lib/densityRange.js). Data QC's
// PLAUSIBLE_RANGE.sg, the density model's DENSITY_RANGE default and every tonnage tool take it from there, and Grade-tonnage hands the project's own range to the density model and the log means.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DEFAULT_DENSITY_RANGE, densityRangeOf } from "../src/lib/densityRange.js";
import { PLAUSIBLE_RANGE } from "../src/lib/dataQC.js";
import { DENSITY_RANGE, densityFromModel } from "../src/lib/densityFromModel.js";
import { sgSummary } from "../src/lib/gradeTonnage.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
test("every default is the one default, 1-6", () => {
  assert.deepEqual(DEFAULT_DENSITY_RANGE, { min: 1, max: 6 });
  assert.equal(PLAUSIBLE_RANGE.sg, DEFAULT_DENSITY_RANGE);
  assert.deepEqual(DENSITY_RANGE, [DEFAULT_DENSITY_RANGE.min, DEFAULT_DENSITY_RANGE.max]);
  assert.deepEqual(densityRangeOf({}), DEFAULT_DENSITY_RANGE);
});
test("the density model takes the project's range; no tool keeps a range literal of its own", () => {
  const cells = [{ x: 5, y: 5, z: 5, value: 7 }];
  const lat = { dx: 10, dy: 10, dz: 10, ox: 0, oy: 0, oz: 0 };
  assert.equal(densityFromModel(cells, lat, 2.7).of(cells[0]), 2.7, "7 is outside 1-6");
  assert.equal(densityFromModel(cells, lat, 2.7, [1, 8]).of(cells[0]), 7, "inside a project range of 1-8");
  const g = read("../src/components/GradeTonnageModal.jsx");
  assert.match(g, /densityFromModel\(densityModel\.cells, latticeOf, rho, densityRangeArr\)/); assert.match(g, /\{ range: densityRangeArr \}/);
  for (const f of ["../src/lib/densityFromModel.js", "../src/lib/densityFromLog.js", "../src/lib/gradeTonnage.js", "../src/lib/sgInSolid.js"]) assert.doesNotMatch(read(f), /\[\s*1\s*,\s*[68]\s*\]|min: 1, max: [68]/.source ? /\bmax: 8\b|\[1, 8\]/ : /x/, f);
});

test("sgSummary (the one-click density and the surface tonnage) takes the project's range, 1-6 by default; every caller passes it", () => {
  const rows = [{ from: 0, to: 1, value: 2.7 }, { from: 1, to: 2, value: 7 }];
  assert.deepEqual([sgSummary(rows).n, sgSummary(rows).left], [1, 1], "7 is outside the default 1-6");
  assert.deepEqual([sgSummary(rows, { min: 1, max: 8 }).n, sgSummary(rows, { min: 1, max: 8 }).left], [2, 0], "inside a project range of 1-8");
  for (const f of ["../src/components/GradeTonnageModal.jsx", "../src/components/PitShellPane.jsx", "../src/components/StopesPane.jsx", "../src/modules/viewer/SurfaceTonnage.jsx"]) assert.match(read(f), /densityRangeOf\(/, f);
  assert.match(read("../src/lib/sgInSolid.js"), /sgSummary\(inside, range\)/);
});
