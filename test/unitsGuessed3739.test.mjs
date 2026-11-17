// TASKS.csv #3739 — a unit taken from the column name ('AppMx' -> mV/V) is said to be assumed, in the legend and the survey list
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { surveyMetaFor } from "../src/lib/surveyLegendDefault.js";
import { geophysLegendGroups } from "../src/lib/legendGroups.js";
import { guessSurveyMethod } from "../src/lib/geophysSurveyTools.js";

test("AppMx / AppRho give a method and a unit that is marked as a guess", () => {
  const mx = surveyMetaFor(guessSurveyMethod("AppMx"), [1, 2, 3]);
  assert.equal(mx.units, "mV/V"); assert.equal(mx.unitsGuessed, true);
  assert.equal(surveyMetaFor(guessSurveyMethod("AppRho"), [10, 100, 1000]).unitsGuessed, true);
});
test("the legend says so; a unit the geologist typed or chose is not marked", () => {
  const rows = [0, 1, 2, 3].map((i) => ({ x: i, y: 0, z: 0, value: i, _src: "Model_AppChg.xyz" }));
  const label = (surveys) => geophysLegendGroups({ rows, surveys: { "Model_AppChg.xyz": surveys } })[0].label;
  assert.match(label({ method: "ip", units: "mV/V", unitsGuessed: true }), /\(mV\/V, assumed from the column name\)/);
  assert.doesNotMatch(label({ method: "ip", units: "mV/V", unitsGuessed: false }), /assumed/);
  assert.doesNotMatch(label({ method: "ip", units: "ms" }), /assumed/);
});
test("wired: the survey list, the units box and the export header; the geologist's own choice clears the flag", () => {
  const g = fs.readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");
  assert.match(g, /unitsGuessed \? `, \$\{tr\("assumed"\)\}`/);
  assert.match(g, /units: e\.target\.value, unitsGuessed: false/);
  assert.match(g, /method: e\.target\.value, unitsGuessed: false/);
  assert.match(g, /assumed from the column name; the file states none/);
});
