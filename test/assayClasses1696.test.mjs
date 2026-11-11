// TASKS.csv #1696 / #1695 (review #1645, Copley) — seeded grade classes: a fourth class above P97.5, lab-only, floor-aware percentiles
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { seedBreaks, labLightness } from "../src/lib/colorRamp.js";

test("Copley Cu: four classes, ore grade (> P97.5) on its own and darkest", () => {
  const b = seedBreaks({ min: 0.1, max: 19400, p50: 5.1, p90: 59.2, p975: 911.1 }, "#c0392b");
  assert.deepEqual(b.map((x) => [x.label, x.max]), [["Low", 5.1], ["Medium", 59.2], ["High", 911.1], ["Very high", 19400]]);
  assert.ok(labLightness(b[3].color) < labLightness(b[2].color));
});

test("without a usable P97.5 the three classes stay as before", () => {
  assert.equal(seedBreaks({ min: 0, max: 10, p50: 2, p90: 6 }, "#c0392b").length, 3);
  assert.equal(seedBreaks({ min: 0, max: 10, p50: 2, p90: 6, p975: 10 }, "#c0392b").length, 3);
});

test("the ranges come from lab assays, with percentiles above a pile at the detection floor", () => {
  const src = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.ok(src.includes('const lab = assaySource === "pxrf" ? assays.filter(isPxrfRow) : assays.filter((a) => a.source !== "pXRF");')); // TASKS.csv #1695: the shown source (lab unless the view shows pXRF alone)
  // #2519: the percentiles moved to lib/assayClasses.js (the floor test kept there for files without '<' flags)
  assert.ok(src.includes("return (c.by[symbol] = assayClassRange(lab.length ? lab : assays, symbol));"));
  const lib = readFileSync(new URL("../src/lib/assayClasses.js", import.meta.url), "utf8");
  assert.ok(lib.includes("const drop = atFloor >= 0.3 * all.length && atFloor < all.length;"));
  assert.ok(lib.includes("p975: q(0.975), basis }"));
});
