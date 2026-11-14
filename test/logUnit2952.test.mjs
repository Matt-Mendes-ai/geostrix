// TASKS.csv #2952 (review #2876, WA iron) — a log layer's unit could not be stated: Density_Best / Gamma_Best / Suscep_Best stayed "in the
// layer's own units". The Downhole logs pane now sets customLayers[].unit, which the source list, the readings line and the 3D legend follow.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { logUnitChoices } from "../src/lib/logUnits.js";
import { numericSourceChoices } from "../src/lib/numericSources.js";
import { customLegendGroups } from "../src/lib/customColour.js";

test("the units offered follow the kind of log the name says; any can be typed", () => {
  assert.deepEqual(logUnitChoices("downhole_logs: Density_Best"), ["g/cc", "kg/m³"]);
  assert.deepEqual(logUnitChoices("downhole_logs: Gamma_Best"), ["API", "cps", "ppm eU3O8"]);
  assert.deepEqual(logUnitChoices("downhole_logs: Suscep_Best"), ["SI", "×10⁻³ SI", "×10⁻⁵ SI"]);
  assert.ok(logUnitChoices("Caliper").length > 3, "an unknown kind gets the common list");
});

test("a unit set on the layer reaches the source list and the 3D legend", () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({ hole_id: "A", from: i, to: i + 1, value: 2.5 + i / 20, n: 3 }));
  const before = { id: 7, name: "downhole_logs: Density_Best", binM: 1, rows };
  const after = { ...before, unit: "g/cc" };
  assert.notEqual(numericSourceChoices({ customLayers: [before] }).find((s) => s.layerId === 7).unit, "g/cc");
  assert.equal(numericSourceChoices({ customLayers: [after] }).find((s) => s.layerId === 7).unit, "g/cc");
  assert.equal(customLegendGroups([after], {}, {})[0].label, "downhole_logs: Density_Best (g/cc)");
});

test("the pane's unit box: a custom log's value channel, set on Enter or leaving the box, stored on the layer", () => {
  const p = readFileSync(new URL("../src/components/DownholeLogsPane.jsx", import.meta.url), "utf8");
  assert.match(p, /const logLayer = source\?\.layerId != null && source\.field === "value" \? customLayers\.find\(\(c\) => c\.id === source\.layerId\) : null;/);
  assert.match(p, /setCustomLayers\(\(p\) => p\.map\(\(c\) => \(c\.id === logLayer\.id \? \{ \.\.\.c, unit: u \|\| undefined \} : c\)\)\)/);
  assert.match(p, /onBlur=\{commit\} onKeyDown=\{\(e\) => \{ if \(e\.key === "Enter"\) commit\(e\); \}\}/);
  assert.doesNotMatch(p, /\buseState\(/, "the pane keeps no plain state (#2394)");
});

test("the import: a unit box beside each ticked channel (the name's unit, else typed), and the layer made with it", () => {
  const b = readFileSync(new URL("../src/components/LogChannelsBox.jsx", import.meta.url), "utf8");
  assert.match(b, /value=\{modal\.logUnits\?\.\[c\.col\] \?\? c\.unit \?\? ""\}/);
  assert.match(b, /set\(\{ logUnits: \{ \.\.\.\(modal\.logUnits \|\| \{\}\), \[c\.col\]: e\.target\.value \} \}\)/);
  const pipe = readFileSync(new URL("../src/modules/viewer/importPipelineImpl.js", import.meta.url), "utf8");
  assert.match(pipe, /const unit = String\(data\.logUnits\?\.\[col\] \?\? unitFromHeader\(col\)\)\.trim\(\);/);
  assert.match(pipe, /unit: unit \|\| undefined/);
});
