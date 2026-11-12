// TASKS.csv #2688 (#2675 part 1) — a saved drill threshold is offered (never applied) as an assay colour-class limit in the 3D View's
// assay style dialog: a click splits the class holding it there (seeding the default classes first when there are none).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { drillThresholdOffers } from "../src/lib/thresholds.js";
import { addClassLimit } from "../src/lib/assayClasses.js";
import { seedBreaks } from "../src/lib/colorRamp.js";

const drill = { symbol: "Au", unit: "g/t", source: "drill", method: "mad", methodLabel: "Median + 2 MAD", groupLabel: "Lithology", values: { all: 0.12 }, decided: "2026-11-09" };
const range = { min: 0.005, max: 12, p50: 0.04, p90: 0.6, p975: 2.1 };

test("the offer for this element and unit, none for another unit", () => {
  const o = drillThresholdOffers([drill], "Au", "g/t");
  assert.equal(o.length, 1); assert.equal(o[0].value, 0.12); assert.equal(o[0].population, null);
  assert.deepEqual(drillThresholdOffers([drill], "Au", "ppm"), []);
});

test("used on an element with no classes: the default classes are seeded and the threshold becomes one more limit", () => {
  const seeded = seedBreaks(range, "#d4a017");
  const out = addClassLimit(seeded, 0.12, "#d4a017");
  assert.equal(out.length, seeded.length + 1);
  assert.ok(out.some((b) => b.max === 0.12 && b.seeded === false));
  assert.deepEqual(out.map((b) => b.max), [...out.map((b) => b.max)].sort((a, b) => a - b));
  assert.equal(addClassLimit(out, 0.12, "#d4a017"), out, "a limit already there is not added twice");
});

test("the assay style dialog wires the offers: offered, never applied, disabled when already a limit", () => {
  const m = readFileSync(new URL("../src/components/AssayStyleModal.jsx", import.meta.url), "utf8");
  assert.match(m, /drillThresholdOffers\(geochemThresholds, symbol, unit\)\.slice\(0, 4\)/);
  assert.match(m, /addClassLimit\(local\.breaks\.length \? local\.breaks : seedBreaks\(\{ \.\.\.range, unit \}, local\.color\), v, local\.color\)/); // the unit: #2935
  assert.match(m, /disabled=\{has\} onClick=\{\(\) => addOffer\(o\.value\)\}/);
  // nothing applies an offer without a click: no effect or initial state reads the offers
  assert.ok(!/useEffect\([^)]*offers/.test(m));
  for (const l of ["es", "pt", "fr", "ar"]) {
    const j = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"));
    assert.ok(j["{rule}{pop}, decided {date}. Click to add it as a class limit."] && j["Already a class limit."], l);
  }
});
