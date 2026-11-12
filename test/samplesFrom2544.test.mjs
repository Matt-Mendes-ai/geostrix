// TASKS.csv #2544 — 'Fit to the checked holes' moved the estimate's grid but all 21,500 composites still informed the run, and the variogram
// had no hole choice at all. Both take 'Samples from: the checked holes', by default when Model area says so.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");

test("Estimation: the samples follow the choice; the default follows Model area; the result records it", () => {
  const s = src("components/GradeEstimationModal.jsx");
  assert.match(s, /useState\(\(\) => \(modelArea === "checked" && checkedHoleIds\?\.size \? "checked" : "all"\)\)/);
  assert.match(s, /samplesFrom === "checked" && checkedHoleIds\?\.size \? assays\.filter\(\(a\) => checkedHoleIds\.has\(a\.hole_id\)\) : assays/);
  assert.match(s, /const srcAssays = useMemo\(\(\) => \(includeQAQC \? sampleAssays : excludeQAQC\(sampleAssays\)\)/);
  assert.match(s, /samplesFrom: samplesFrom === "checked" && checkedHoleIds\?\.size \? `holes checked in the Holes list/);
  assert.match(s, /<option value="checked">\{tr\("The checked holes \(\{n\} of \{total\}\)"/);
});

test("Variogram: the same choice and default; the header counts the holes used", () => {
  const s = src("components/VariogramModal.jsx");
  assert.match(s, /export default function VariogramModal\(\{ assays: assaysAll, .*checkedHoleIds = null, modelArea = null/);
  assert.match(s, /samplesFrom === "checked" && checkedHoleIds\?\.size \? assaysAll\.filter\(\(a\) => checkedHoleIds\.has\(a\.hole_id\)\) : assaysAll/);
  assert.match(s, /collars: samplesFrom === "checked" \? checkedN : collars\.length/);
});

test("ViewerModule passes Model area and the checked holes to both", () => {
  const v = src("modules/ViewerModule.jsx");
  assert.match(v, /modelArea=\{modelArea\} \/\/ TASKS\.csv #1570; #2544/);
  // #2695 — one memoized Set of the checked holes, passed to both
  assert.match(v, /const checkedHoleIds = useMemo\(\(\) => new Set\(collars\.filter\(\(c\) => visibleHoles\[c\.hole_id\] !== false\)\.map\(\(c\) => c\.hole_id\)\), \[collars, visibleHoles\]\);/);
  assert.match(v, /<VariogramModal modelArea=\{modelArea\} checkedHoleIds=\{checkedHoleIds\}/);
  for (const l of ["es", "pt", "fr", "ar"]) assert.ok(JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"))["Samples from"], l);
});
