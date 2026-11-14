// TASKS.csv #1680 — g/t for precious metals in ppm across the grade tools; Best intercepts can show a base metal in %.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync as readRaw } from "node:fs";
import { gradeUnitLabel } from "../src/lib/geochem.js";
const read = (p) => readRaw(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("a precious metal in ppm reads g/t; everything else keeps its unit", () => {
  for (const s of ["Au", "Ag", "Pt", "Pd"]) assert.equal(gradeUnitLabel(s, "ppm"), "g/t");
  assert.equal(gradeUnitLabel("Au", undefined), "g/t");
  assert.equal(gradeUnitLabel("Au", "ppb"), "ppb");
  assert.equal(gradeUnitLabel("Cu", "ppm"), "ppm");
  assert.equal(gradeUnitLabel("Cu", "%"), "%");
});

test("Grade stats, Compositing and Best intercepts label with it; Best intercepts offers % for a base metal in ppm", () => {
  assert.match(read("src/components/GradeStatistics.jsx"), /\{ symbol, v: gradeUnitLabel\(symbol, elementUnits\[symbol\]\)/);
  assert.match(read("src/components/CompositingModal.jsx"), /tr\("High-grade cap \(\{unit\}\)", \{ unit: unitL/);
  const b = read("src/components/BestIntercepts.jsx");
  assert.match(b, /const pctOk = unit === "ppm" && !PRECIOUS_METALS\.has\(symbol\);/);
  assert.match(b, /const dg = \(v\) => \(pct \? v \/ 1e4 : v\);/);
  assert.match(b, /\{tr\("Cutoff \(\{unit\}\)", \{ unit: (unitL|dispUnit \/\* #3221 \*\/) \}\)\}/); // #3221: typed in % when 'Show as %' is on
  assert.match(b, /row\[`avg_\$\{gradeSym\}_pct`\] = \+\(results\[i\]\.avgGrade \/ 1e4\)\.toPrecision\(6\);/);
});
