// TASKS.csv #3236 — Best intercepts reads the project's display unit for the element (project.displayUnits), sets it in 'Show in' when the
// store has the setter, moves a session's 'Show as %' into it once, and labels every converted value (the CSV names its shown-unit column)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isPlainUnit } from "../src/lib/displayUnits.js";

const s = readFileSync(new URL("../src/components/BestIntercepts.jsx", import.meta.url), "utf8");
const pick = (re) => s.match(re)[0];

test("the shown unit: the project's choice for a plain stored unit, else as stored", () => {
  const f = new Function("isPlainUnit", "unit", "chosen", `${pick(/const shownUnit = [^\n]*;/)} return shownUnit;`);
  assert.equal(f(isPlainUnit, "ppm", "%"), "%");
  assert.equal(f(isPlainUnit, "ppm", undefined), null);
  assert.equal(f(isPlainUnit, "% SiO2", "%"), null, "an oxide basis is shown as stored");
});

test("wiring: migration, the control, the labels and the CSV", () => {
  assert.match(s, /if \(asPct\) \{ if \(pctOk && !chosen\) setDisplayUnit\(symbol, "%"\); setAsPct\(false\); \}/);
  assert.match(s, /const dispUnit = shownUnit \|\| unitL;/);
  assert.match(s, /<select value=\{shownUnit \|\| ""\} onChange=\{\(e\) => setDisplayUnit\(symbol, e\.target\.value \|\| null\)\}/);
  assert.doesNotMatch(s, /unitsKept|tr\("Show as %"\)/, "the store has the setter: the old checkbox is gone");
  assert.match(s, /Display unit: \$\{gradeSym\} is shown in \$\{dispUnit\}; the avg_\$\{gradeSym\}_\$\{unitSlug\(dispUnit\)\} column is in \$\{dispUnit\}/);
  assert.match(s, /\{tr\("Cutoff \(\{unit\}\)", \{ unit: dispUnit/);
});

test("Grade stats: the rows in the shown unit, the floor, the offers and the cap converted to match, the label, the CSV, the shared control", () => {
  const g = readFileSync(new URL("../src/components/GradeStatistics.jsx", import.meta.url), "utf8");
  assert.match(g, /const shownUnit = isPlainUnit\(storedUnit\) && isPlainUnit\(chosenUnit\) \? chosenUnit : null;/);
  assert.match(g, /const rows = useMemo\(\(\) => \(dk === 1 \? rowsStored : rowsStored\.map\(\(r\) => \(\{ \.\.\.r, value: toDisplay\(r\.value, storedUnit, shownUnit\) \}\)\)\)/);
  assert.match(g, /Math\.abs\(r\.value - toShown\(ltFloor\.floor\)\)/);
  assert.match(g, /value: toShown\(bi\)/);
  assert.match(g, /value: toShown\(o\.value\)/);
  assert.match(g, /dk === 1 \? capValue : fromDisplay\(capValue, storedUnit, shownUnit\)/);
  assert.match(g, /Display unit: every \$\{symbol\} value in this file is in \$\{shownUnit\} \(stored in \$\{storedUnit\}\)/);
  assert.match(g, /onChange=\{\(e\) => setDisplayUnit\(symbol, e\.target\.value \|\| null\)\}/);
});
