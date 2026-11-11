// TASKS.csv #1788 — a resistivity model opened on the cream-to-plum sequential ramp (the conductive target at 14.9 ohm·m the palest colour)
// while the palette dropdown read 'Viridis'. Resistivity now opens on the Resistivity / IP palette (low = red), conductivity on it reversed,
// and the dropdown says 'The model's own colours' when the stops came from elsewhere.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { propertyRamp } from "../src/lib/voxelProperty.js";
import { PALETTES } from "../src/lib/layers.js";
import { logStops } from "../src/lib/inversion.js";

test("the ramp a new model opens with, by property", () => {
  const r = propertyRamp("Resistivity (ohm·m)");
  assert.equal(r.palette, "resistivity");
  assert.equal(r.anchors[0], "#c83c28"); // low resistivity = red
  const c = propertyRamp("Conductivity (S/m)");
  assert.equal(c.palette, null);
  assert.equal(c.anchors[c.anchors.length - 1], "#c83c28"); // high conductivity = red
  assert.equal(propertyRamp("Chargeability (mV/V)"), null);
  assert.equal(propertyRamp(null), null);
  assert.deepEqual(PALETTES.resistivity.colors.slice(-1), ["#3b3bbe"]);
});

test("log stops on that ramp: the lowest stop is red, not cream", () => {
  const stops = logStops(14.9, 5224, propertyRamp("Resistivity (ohm·m)").anchors);
  assert.equal(stops[0].color.toLowerCase(), "#c83c28");
  assert.notEqual(stops[0].color.toLowerCase(), "#fff7cc");
  assert.ok(Math.abs(stops[0].value - 14.9) < 1e-6 && Math.abs(stops[stops.length - 1].value - 5224) < 1e-6);
});

test("the imports use it and the editor shows the palette in use", () => {
  const src = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");
  assert.equal((src.match(/logStops\(min, max, ramp\?\.anchors \|\| SEQUENTIAL_ANCHORS\)/g) || []).length, 2); // UBC and CSV
  assert.match(src, /useState\(\(\) => \(model\.palette && PALETTES\[model\.palette\] \? model\.palette : \(model\.stops \|\| \[\]\)\.length \? "__own" : "viridis"\)\)/);
  assert.match(src, /tr\("The model's own colours"\)/);
  assert.match(src, /setStops\(stops\.map\(\(s, i\) => \(\{ \.\.\.s, color: colors\[i\] \}\)\), \{ palette \}\)/);
});
