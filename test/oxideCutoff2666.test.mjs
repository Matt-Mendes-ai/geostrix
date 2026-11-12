// TASKS.csv #2666 — Stope outlines' cut-off typed in the reported oxide (% Li2O for a Li model), converted to the model's unit
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { cutoffUnits } from "../src/lib/pitShell.js";

const conv = (unit, el, key, v) => cutoffUnits(unit, el).find((u) => u.key === key).toModel(v);

test("the units offered and their conversions", () => {
  assert.deepEqual(cutoffUnits("%", "Li").map((u) => u.label), ["% Li", "% Li2O"]);
  assert.ok(Math.abs(conv("%", "Li", "ox", 1) - 0.4645) < 1e-4); // the industry's 1 % Li2O
  assert.deepEqual(cutoffUnits("ppm", "Li").map((u) => u.label), ["ppm Li", "% Li", "ppm Li2O", "% Li2O"]);
  assert.ok(Math.abs(conv("ppm", "Li", "ox%", 1) - 4645.33) < 0.01);
  assert.deepEqual(cutoffUnits("ppm", "U").map((u) => u.label), ["ppm U", "ppm U3O8"]); // uranium stays in ppm (#2111)
  assert.ok(Math.abs(conv("ppm", "U", "ox", 500) - 424.016) < 0.01);
  assert.deepEqual(cutoffUnits("ppm", "Cu").map((u) => u.key), ["", "%"]);
  assert.deepEqual(cutoffUnits("g/t", "Au").map((u) => u.label), ["g/t Au"]); // one unit: no select
  assert.equal(conv("ppm", "Cu", "", 3000), 3000);
});

test("the pane: a select of the units, the run and its record in the model's unit", () => {
  const p = fs.readFileSync("src/components/StopesPane.jsx", "utf8");
  assert.match(p, /const cutUnits = cutoffUnits\(unit, element\), cutUnit = cutUnits\.find\(\(u\) => u\.key === f\.cutIn\) \|\| cutUnits\[0\], pctOk = cutUnits\.length > 1, pctIn = cutUnit\.key !== "";/);
  assert.match(p, /\{ cutoff: cutV, levelH/);
  assert.match(p, /inputs: \{ \.\.\.f, \.\.\.\(pctIn \? \{ cutoff: String\(cutV\), cutIn: "" \} : \{\}\)/);
});
