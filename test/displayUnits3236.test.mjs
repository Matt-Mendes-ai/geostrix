// TASKS.csv #3236 — a per-element display unit kept with the project (project.displayUnits), display only, plain units only
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { displayUnitOf, displayFactor, toDisplay, fromDisplay, unitSlug, isPlainUnit, DISPLAY_UNITS } from "../src/lib/displayUnits.js";

test("the shown unit: the project's choice for a plain stored unit, else as stored", () => {
  const project = { displayUnits: { Cu: "%", Au: "ppb", Si: "ppm", Fe: "bogus" } };
  assert.equal(displayUnitOf(project, "Cu", "ppm"), "%");
  assert.equal(displayUnitOf(project, "Au", "g/t"), "ppb");
  assert.equal(displayUnitOf(project, "Si", "% SiO2"), "% SiO2", "an oxide basis is shown as stored");
  assert.equal(displayUnitOf(project, "Fe", "%"), "%", "an unknown choice is ignored");
  assert.equal(displayUnitOf({}, "Cu", "ppm"), "ppm", "an older project has none");
  assert.equal(displayUnitOf(null, "Cu", "ppm"), "ppm");
  assert.deepEqual(DISPLAY_UNITS.filter(isPlainUnit), DISPLAY_UNITS);
});

test("conversion both ways, and nothing for the same or a non-plain unit", () => {
  assert.equal(displayFactor("ppm", "%"), 1e-4);
  assert.equal(toDisplay(7900, "ppm", "%"), 0.79);
  assert.equal(fromDisplay(0.2, "ppm", "%"), 2000, "a 0.2 typed in % is 2,000 ppm");
  assert.equal(toDisplay(1.5, "g/t", "ppb"), 1500);
  assert.equal(toDisplay(1.5, "ppm", "g/t"), 1.5);
  assert.equal(toDisplay(12, "% SiO2", "%"), 12);
  assert.equal(toDisplay(null, "ppm", "%"), null);
  assert.equal(fromDisplay(toDisplay(0.333, "ppm", "%"), "ppm", "%"), 0.333);
  assert.equal(unitSlug("%"), "pct"); assert.equal(unitSlug("g/t"), "gpt"); assert.equal(unitSlug("ppb"), "ppb");
});

test("kept apart from geochem.js: the lib imports nothing", () => {
  const s = readFileSync(new URL("../src/lib/displayUnits.js", import.meta.url), "utf8");
  assert.doesNotMatch(s, /^import /m);
});
