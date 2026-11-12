// TASKS.csv #2685 — the drill plan colours each hole by its best intercept's grade × length (Best intercepts' rule), beside the whole-hole sum
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bestInterceptGT, p90Cutoff, drillPlanColouring } from "../src/lib/drillPlan.js";
import { computeBestIntercepts } from "../src/lib/geochem.js";

const assays = [
  // hole A: 3 m at 2, a 1 m gap at 0.1, then 2 m at 5 -> with 1 m dilution one 6 m intercept; with none, the 2 m at 5 (GT 10) wins over 3 m at 2 (6)
  ...[2, 2, 2, 0.1, 5, 5].map((v, i) => ({ hole_id: "A", from: i, to: i + 1, values: { Au: v } })),
  ...[0.1, 0.2, 0.1].map((v, i) => ({ hole_id: "B", from: i, to: i + 1, values: { Au: v } })),
];
const units = { Au: "ppm" };

test("the best intercept per hole, as grade × length", () => {
  const none = bestInterceptGT(computeBestIntercepts(assays, "Au", "ppm", units, { cutoff: 1, maxInternalDilution: 0 }));
  assert.equal(none.get("A"), 10);
  assert.equal(none.has("B"), false, "no intercept above the cut-off");
  const dil = bestInterceptGT(computeBestIntercepts(assays, "Au", "ppm", units, { cutoff: 1, maxInternalDilution: 1 }));
  assert.ok(Math.abs(dil.get("A") - (2 * 3 + 0.1 + 5 * 2)) < 1e-9, String(dil.get("A")));
});

test("the default cut-off is the P90 rounded to one figure, as Best intercepts suggests", () => {
  assert.equal(p90Cutoff([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.4]), 0.9);
  assert.equal(p90Cutoff([]), null);
});

test("the colouring says which rule it used, and names the holes with no intercept", () => {
  const holes = [{ id: "A" }, { id: "B" }];
  const per = new Map([["A", 10]]);
  const c = drillPlanColouring({ colourBy: "bi:Au" }, holes, [{ hole_id: "A" }, { hole_id: "B" }], { perHole: per, unit: "g/t", biRule: "cut-off 1 g/t, at most 2 m internal dilution" });
  assert.equal(c.title, "Au best intercept, grade × length");
  assert.match(c.note, /^cut-off 1 g\/t, at most 2 m internal dilution/);
  assert.ok(c.key.some((k) => k.label === "no Au intercept" && k.hollow));
  assert.equal(c.styleOf("B").hollow, true);
});

test("wired: the plan's input, the cache and the sidebar fields", () => {
  const d = readFileSync(new URL("../src/components/DrillPlanElement.jsx", import.meta.url), "utf8");
  assert.match(d, /if \(kind === "bi"\) return \{ \.\.\.bestInterceptInput\(el, assays, key, unit, units\), unit: gradeUnitLabel\(key, unit\) \};/);
  assert.match(d, /const biCache = new WeakMap\(\);/);
  const c = readFileSync(new URL("../src/components/DrillPlanColourControls.jsx", import.meta.url), "utf8");
  assert.match(c, /<option value="bi">\{tr\("Best intercept, grade × length \(cut-off\)"\)\}<\/option>/);
  assert.match(c, /\["biCutoff", tr\("Cut-off"\), tr\("P90"\)\]/);
});
