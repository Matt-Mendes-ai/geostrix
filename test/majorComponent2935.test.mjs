// TASKS.csv #2935 (WA iron review) — a major component (Fe, SiO2, Al2O3: a % unit, median 5 % or more) is seeded with round equal steps,
// not the trace-metal percentiles that put Fe's 50 % and 55 % cut-offs inside one class; Reset returns those seeded classes; a seeded style
// is not called 'customized'.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { majorComponentSteps, isMajorComponent, seedBreaks } from "../src/lib/colorRamp.js";

const fe = { min: 0, max: 68.51, p50: 35.39, p90: 57.33, p975: 62.13, unit: "%" };

test("Fe gets 30 / 40 / 50 / 60 / 68.51; SiO2 25 / 50 / 75 / 95; the classes are seeded and darken upward", () => {
  assert.deepEqual(majorComponentSteps(fe), [30, 40, 50, 60, 68.51]);
  assert.deepEqual(majorComponentSteps({ min: 0, max: 95, p50: 25.6, unit: "% SiO2" }), [25, 50, 75, 95]);
  const b = seedBreaks(fe, "#4a9be0");
  assert.deepEqual(b.map((x) => x.max), [30, 40, 50, 60, 68.51]);
  assert.ok(b.every((x) => x.seeded));
  assert.equal(b[0].label, "≤ 30");
  assert.equal(b[2].label, "40–50");
  assert.equal(new Set(b.map((x) => x.color)).size, 5);
});

test("trace elements keep the percentile classes: ppm, or a % element with a low median", () => {
  assert.equal(isMajorComponent({ min: 0, max: 5000, p50: 50, unit: "ppm" }), false);
  assert.equal(isMajorComponent({ min: 0, max: 12, p50: 0.8, unit: "%" }), false);
  assert.equal(isMajorComponent({ ...fe, unit: undefined }), false, "no unit known: as before");
  const cu = seedBreaks({ min: 0, max: 5000, p50: 50, p90: 400, p975: 1200, unit: "ppm" }, "#4a9be0");
  assert.deepEqual(cu.map((x) => x.max), [50, 400, 1200, 5000]);
});

test("wiring: the range carries the unit; Reset seeds; the chip's 'customized' ignores seeded classes; the dialog says round steps", () => {
  const v = fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /return \(c\.by\[symbol\] = r && \{ \.\.\.r, unit: assayElements\.find\(\(e\) => e\.symbol === symbol\)\?\.unit \}\);/);
  assert.match(v, /style\.breaks\?\.some\(\(b\) => !b\.seeded\) \|\| style\.shape/);
  const m = fs.readFileSync(new URL("../src/components/AssayStyleModal.jsx", import.meta.url), "utf8");
  assert.match(m, /const reset = \(\) => commit\(\{ color: defaultColor, sizeMult: 1, shape: "auto", opacity: 1, minCutoff: "", breaks: seedBreaks\(\{ \.\.\.range, unit \}, defaultColor\) \}\);/);
  assert.ok(!/seedBreaks\(range, /.test(m), "every seeding passes the unit");
  assert.match(m, /Default classes: round steps of the data, as for a major component/);
});
