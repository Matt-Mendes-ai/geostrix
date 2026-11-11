// TASKS.csv #2400 — 'Reset to default' after Classify left Style on 'Classified (stepped)' and replaced an estimate's 17-stop log legend with a
// linear 2-98 % stretch
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { defaultModelLegend } from "../src/lib/modelDefaultStops.js";
import { isLogSpaced } from "../src/lib/pointSurveyScale.js";

test("a log estimate goes back to its log grade ramp, continuous", () => {
  const d = defaultModelLegend({ min: 0.33, max: 632.5, logScale: true, colorMode: "discrete" });
  assert.equal(d.colorMode, "continuous");
  assert.equal(d.stops.length, 17);
  assert.equal(isLogSpaced(d.stops), true);
  assert.equal(d.stops[0].color.toLowerCase(), "#440154"); // the grade (viridis) ramp
});

test("a log resistivity model goes back to its red-to-blue ramp; a linear model to the default gradient", () => {
  const r = defaultModelLegend({ min: 14.9, max: 5224, logScale: true, property: "Resistivity (ohm·m)" });
  assert.equal(r.stops[0].color.toLowerCase(), "#c83c28");
  assert.deepEqual(defaultModelLegend({ min: 0, max: 5, colorMode: "discrete" }), { colorMode: "continuous", stops: [] });
  assert.deepEqual(defaultModelLegend({ id: "geophys_pts", min: 1, max: 9 }), { colorMode: "continuous", stops: [] });
});

test("the editor's Reset uses it", () => {
  const src = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");
  assert.match(src, /const resetToDefault = \(\) => \{ const d = defaultModelLegend\(model\); setStops\(d\.stops, \{ colorMode: d\.colorMode \}\); \};/);
});
