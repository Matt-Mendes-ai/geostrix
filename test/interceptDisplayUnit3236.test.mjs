// TASKS.csv #3236 — Best intercepts reads the project's display unit for the element (project.displayUnits), sets it in 'Show in' when the
// store has the setter, moves a session's 'Show as %' into it once, and labels every converted value (the CSV names its shown-unit column)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isPlainUnit } from "../src/lib/displayUnits.js";

const s = readFileSync(new URL("../src/components/BestIntercepts.jsx", import.meta.url), "utf8");
const pick = (re) => s.match(re)[0];

test("the shown unit: the project's choice, else the session's 'Show as %' before the setter, else as stored", () => {
  const f = new Function("isPlainUnit", "unit", "chosen", "unitsKept", "pctOk", "asPct", `${pick(/const shownUnit = [^\n]*;/)} return shownUnit;`);
  assert.equal(f(isPlainUnit, "ppm", "%", true, true, false), "%");
  assert.equal(f(isPlainUnit, "ppm", "ppb", false, true, true), "ppb", "a saved choice is read without the setter");
  assert.equal(f(isPlainUnit, "ppm", undefined, false, true, true), "%", "the old checkbox until the setter exists");
  assert.equal(f(isPlainUnit, "ppm", undefined, true, true, true), null, "with the setter the checkbox has moved into the project");
  assert.equal(f(isPlainUnit, "% SiO2", "%", true, false, false), null, "an oxide basis is shown as stored");
});

test("wiring: migration, the control, the labels and the CSV", () => {
  assert.match(s, /if \(unitsKept && asPct\) \{ if \(pctOk && !chosen\) setDisplayUnit\(symbol, "%"\); setAsPct\(false\); \}/);
  assert.match(s, /const dispUnit = shownUnit \|\| unitL;/);
  assert.match(s, /<select value=\{shownUnit \|\| ""\} onChange=\{\(e\) => setDisplayUnit\(symbol, e\.target\.value \|\| null\)\}/);
  assert.match(s, /\{!unitsKept && pctOk && <label/);
  assert.match(s, /Display unit: \$\{gradeSym\} is shown in \$\{dispUnit\}; the avg_\$\{gradeSym\}_\$\{unitSlug\(dispUnit\)\} column is in \$\{dispUnit\}/);
  assert.match(s, /\{tr\("Cutoff \(\{unit\}\)", \{ unit: dispUnit/);
});
