// TASKS.csv #2639 — the equivalent-sources grid keeps its survey's method and unit, and worms / tilt-depth products are said to be heights /
// depths in metres, so no field filter is offered on them; the unit on the colour bar is #1858's
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SURVEY_METHODS } from "../src/lib/geophysSurveys.js";
import { rasterMethodOf, filterBlockedBy, rasterUnitOf } from "../src/lib/rasterMethod.js";
const read = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");

test("#2639 worms / tilt-depth products: their own method, no field filters", () => {
  assert.deepEqual([SURVEY_METHODS.worms_height.units, SURVEY_METHODS.tiltdepth_depth.units], ["m", "m"]);
  assert.equal(rasterMethodOf({ surveyMethod: "worms_height" }, {}), "worms_height");
  for (const k of ["rtp", "vd1", "tilt", "upward"]) { assert.equal(filterBlockedBy(k, "worms_height"), "potential"); assert.equal(filterBlockedBy(k, "tiltdepth_depth"), "potential"); }
  assert.equal(filterBlockedBy("rtp", "mag"), null);
  const m = read("modules/RasterModule.jsx");
  assert.match(m, /extra: \{ surveyMethod: "worms_height", units: "m"/);
  assert.match(m, /extra: \{ surveyMethod: "tiltdepth_depth", units: "m"/);
});

test("#2639 the equivalent-sources grid keeps its survey's method and unit", () => {
  assert.match(read("components/EqsGridBox.jsx"), /surveyMethod: method \|\| undefined, units: units \|\| undefined/);
  assert.match(read("modules/GeophysicsModule.jsx"), /<EqsGridBox survey=\{sv\.key\} rows=\{rows\} units=\{meta\.units \|\| ""\} method=\{meta\.method \|\| null\}/);
});

test("#2639 a gridded survey's unit shows under the colour bar without typing it", () => {
  assert.equal(rasterUnitOf({ units: "nT" }), "nT");
  assert.equal(rasterUnitOf({ unit: "mV/V", units: "nT" }), "mV/V"); // typed on the card wins
  assert.equal(rasterUnitOf({ geochem: { unit: "ppm" }, units: "x" }), "ppm");
});
