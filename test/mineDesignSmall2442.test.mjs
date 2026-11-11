// TASKS.csv #2281, #2442, #2443, #2445, #2601, #2602 — small Mine Design fixes
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { PRICED_MASS_T } from "../src/lib/pitShell.js";

const pit = fs.readFileSync("src/components/PitShellPane.jsx", "utf8"), str = fs.readFileSync("src/components/DesignStringsPane.jsx", "utf8");

test("#2442: $/lb -> $/t -> $/lb from the typed price returns it exactly; the shown $/t is within the 1e-5 check", () => {
  const toT = 80 * (PRICED_MASS_T.t / PRICED_MASS_T.lb), shown = +toT.toPrecision(6);
  assert.equal(shown, 176370);
  assert.ok(Math.abs(toT - shown) <= 1e-5 * shown); // so the typed 80 $/lb is still the source on the way back
  assert.match(pit, /price: to === from && src \? src\.value : conv == null/);
});

test("#2443: the main model's element is not offered as its by-product", () => {
  assert.match(pit, /!\(element && elementOfModel\(m\) === element\)/);
});

test("#2602: the form keeps what was set in it for the session", () => {
  assert.match(pit, /useEffect\(\(\) => \{ keptForm = \{ f, modelId \}; \}\);/);
  assert.match(pit, /keptForm && models\.some\(\(m\) => \(m\.id \?\? m\.name\) === keptForm\.modelId\) \? keptForm\.f/);
});

test("#2281 / #2445: no 'taken as not set'; a typed vertex with a blank Z takes the target's elevation", () => {
  assert.ok(str.includes('crs: crsCell(project) !== "not set" ? crsCell(project) : tr("the project\'s coordinates (no CRS set)")'));
  assert.match(str, /const typedZ = num0\(typed\.z\) \?\? typedTargetZ\(num0\(typed\.x\), num0\(typed\.y\)\);/);
  assert.match(str, /disabled=\{num0\(typed\.x\) == null \|\| num0\(typed\.y\) == null \|\| typedZ == null\}/);
});

test("#2601: stope outlines are not dump footprints or design areas", () => {
  assert.match(fs.readFileSync("src/components/DumpPane.jsx", "utf8"), /!s\.stopeRun/);
  assert.match(fs.readFileSync("src/components/PitDesignPane.jsx", "utf8"), /!s\.stopeRun/);
});
