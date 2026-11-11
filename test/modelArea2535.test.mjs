// TASKS.csv #2535 — Model area = 'Holes checked' leaked: a custom-layer halo gridded the whole property, the Explicit surface seeded from every
// hole and its picks fed the Implicit run, the model check scored unchecked holes, and the setting was not saved or recorded on the surfaces.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { explicitInterfacePoints } from "../src/lib/explicitUnits.js";

test("explicit interface points keep a seeded pick's hole, so a run can leave the area's others out", () => {
  const defs = [{ name: "Top P", unit: "P", picks: [{ x: 1, y: 2, z: 3, hole_id: "IN1" }, { x: 4, y: 5, z: 6, hole_id: "OUT1" }, { x: 7, y: 8, z: 9 }] }];
  const { used } = explicitInterfacePoints(defs, [], new Set(["P"]));
  assert.deepEqual(used[0].points, [{ x: 1, y: 2, z: 3, hole_id: "IN1" }, { x: 4, y: 5, z: 6, hole_id: "OUT1" }, { x: 7, y: 8, z: 9 }]);
});

const src = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");

test("the runs follow the Model area and record it", () => {
  const r = src("modules/viewer/modellingRuns.js");
  assert.match(r, /if \(modelArea === "checked" && visibleHoles\?\.\[t\.hole_id\] === false\) return; \/\/ TASKS\.csv #2535 — the model check/);
  assert.match(r, /customSrc \? \(modelArea === "checked" \? restrictRowsToHoles\(customSrc\.rows \|\| \[\], visibleHoles\)/);
  assert.match(r, /if \(modelArea === "checked" && wp\.hole_id && visibleHoles\?\.\[wp\.hole_id\] === false\) \{ outOfArea\+\+; continue; \}/);
  assert.match(r, /setImplicitSurfaces: setImplicitSurfacesRaw/);
  assert.match(r, /params: \{ \.\.\.sf\.params, modelArea: areaParam\(\) \}/);
});

test("the Explicit surface seeds from the area; the setting is saved with the project's view state", () => {
  const p = src("modules/viewer/ModellingPanes.jsx");
  assert.match(p, /codedRuns\(modelArea === "checked" \? \(layers\.litho \|\| \[\]\)\.filter\(\(r\) => visibleHoles\?\.\[r\.hole_id\] !== false\)/);
  const v = src("modules/ViewerModule.jsx");
  assert.match(v, /setModelArea\(s\.modelArea === "checked" \? "checked" : "all"\); \/\/ #2535/);
  assert.match(v, /      modelArea, \/\/ #2535\n?\r?\n?\s*\};\s*\r?\n\s*setViewerUiState\(ui\);/);
});

test("the stamping wrapper: new surfaces get the area, existing ones and those that already say it are left alone", () => {
  // the wrapper's logic, as written in modellingRuns.js
  const stamp = (prev, next, area) => { const had = new Set(prev || []); return (next || []).map((sf) => (had.has(sf) || !sf?.params || sf.params.modelArea ? sf : { ...sf, params: { ...sf.params, modelArea: area } })); };
  const old = { id: "a", params: { tool: "x" } }, own = { id: "b", params: { modelArea: "whole property" } }, fresh = { id: "c", params: { tool: "y" } }, bare = { id: "d" };
  const out = stamp([old], [old, own, fresh, bare], "holes checked in the Holes list (30 of 2248)");
  assert.equal(out[0], old); assert.equal(out[1], own); assert.equal(out[3], bare);
  assert.equal(out[2].params.modelArea, "holes checked in the Holes list (30 of 2248)");
});
