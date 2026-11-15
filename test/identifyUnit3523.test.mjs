// TASKS.csv #3523 (from #3164's live check) — Identify said "Value 20.04" for a block of an estimate or a calculated model, though its record
// holds the element and unit. The label now says what the value is; the model's own property name still wins (#1811).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { blockValueLabel } from "../src/lib/viewer/identify.js";

test("a block's value label: property, element and unit, derived values, unit only, nothing", () => {
  assert.equal(blockValueLabel({ property: "Chargeability (mV/V)", params: { element: "Fe", unit: "%" } }), "Chargeability (mV/V)", "#1811: the property wins");
  assert.equal(blockValueLabel({ source: "calc", params: { element: "Calcined Fe", unit: "%" } }), "Calcined Fe (%)", "a calculated model");
  assert.equal(blockValueLabel({ source: "estimate-idw2", params: { element: "Fe", unit: "%" } }), "Fe (%)");
  assert.equal(blockValueLabel({ source: "estimate-ok", params: { element: "Au", unit: "ppm" } }), "Au (g/t)", "a precious metal in ppm reads g/t, as the set line");
  assert.equal(blockValueLabel({ source: "support-index-idw2", params: { element: "Au", unit: "ppm" } }), "Value", "a support index is not a grade");
  assert.equal(blockValueLabel({ source: "kriging-variance", params: { element: "Cu", unit: "%" } }), "Value (% squared)", "a kriging variance in its own unit");
  assert.equal(blockValueLabel({ source: "csv", params: { unit: "t/m3" } }), "Value (t/m3)");
  assert.equal(blockValueLabel({ source: "omf", params: {} }), "Value");
  assert.equal(blockValueLabel({}), "Value");
});

test("wiring: Identify's block value uses the label", () => {
  const s = readFileSync(new URL("../src/lib/viewer/identify.js", import.meta.url), "utf8");
  assert.match(s, /fields\.push\(\[blockValueLabel\(m\), m\.valueLabels\?\.\[c\.value\]/);
  assert.doesNotMatch(s, /fields\.push\(\[m\.property \|\| tr\("Value"\)/);
});
