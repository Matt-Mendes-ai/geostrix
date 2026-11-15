// TASKS.csv #3507 unsampled chips on RC holes; #3508 the cell height with the flat search; #3509 the fetched picture under a tile
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { unsampledWord } from "../src/lib/holeType.js";
import { cellHeightFromRange } from "../src/lib/estimateMemory.js";
const src = (f) => fs.readFileSync(new URL(f, import.meta.url), "utf8").replace(/\r\n/g, "\n");
test("chips for RC / aircore drilling, core for diamond or no type", () => {
  const c = (t) => ({ attrs: t ? { "hole type": t } : {} });
  assert.equal(unsampledWord([c("Reverse circulation (RC)"), c("Reverse circulation (RC)"), c("Diamond (DD)")]), "chips");
  assert.equal(unsampledWord([c("Aircore (AC)"), c("RAB")]), "chips");
  assert.equal(unsampledWord([c("Diamond (DD)"), c("Diamond (DD)"), c("Reverse circulation (RC)")]), "core");
  assert.equal(unsampledWord([c(null), c(null)]), "core");
  assert.equal(unsampledWord([]), "core");
  assert.equal(unsampledWord([c("RC + diamond tail"), c("Diamond (DD)")]), "core");
});
test("the cell height is a quarter of the downhole range, to the half metre, at least 0.5", () => {
  assert.equal(cellHeightFromRange(28), 7);
  assert.equal(cellHeightFromRange(10), 2.5);
  assert.equal(cellHeightFromRange(1.2), 0.5);
  assert.equal(cellHeightFromRange(0), null);
});
test("wiring", () => {
  assert.match(src("../src/components/GradeEstimationModal.jsx"), /tr\(chips \? \(nonMetal \? "[^\n]*unsampled chips/);
  assert.match(src("../src/modules/viewer/ModellingPanes.jsx"), /setNumericCellHeight\(cellHeightFromRange\(an\.downholeM\)\)/);
});
