// TASKS.csv #3248 — the Level plan offered only the layers shown in the 3D View: a model layer (Strat unit) could colour the plan only by
// switching it on there. The hidden logged layers with rows are listed greyed, 'hidden in 3D'; picking one builds the plan with it.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { hiddenPlanLayers } from "../src/modules/viewer/levelPlanBuild.js";

const meta = { litho: { label: "Lithology" }, alt: { label: "Alteration" }, weath: { label: "Weathering" } };
const ctx = {
  layerVisible: { litho: true, alt: false, weath: false },
  layers: { litho: [{ hole_id: "A" }], alt: [{ hole_id: "A" }], weath: [] },
  customLayers: [{ id: 7, name: "Strat unit", rows: [{ hole_id: "A" }] }, { id: 8, name: "Gamma", rows: [{ hole_id: "A" }] }, { id: 9, name: "Empty", rows: [] }],
  customVisible: { 7: false, 9: false },
};
const src = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("the hidden layers with rows, built-in and custom; shown or empty ones are not listed", () => {
  assert.deepEqual(hiddenPlanLayers(ctx, meta), [{ key: "alt", label: "Alteration" }, { key: "custom:7", label: "Strat unit" }]);
  assert.deepEqual(hiddenPlanLayers({}, meta), []);
});

test("wiring: the build asks for the picked layer (scope.also), its cache keyed by it; the 3D View's own filter honours also", () => {
  const b = src("../src/modules/viewer/levelPlanBuild.js"), w = src("../src/components/LevelPlanWindow.jsx"), v = src("../src/modules/ViewerModule.jsx");
  assert.match(b, /prims = ctx\.layerPrimitivesFor\(all, ctx\.also\?\.length \? \{ also: ctx\.also \} : \{\}\);/);
  assert.match(w, /runSliced\(planBuild\(\{ \.\.\.ctxRef\.current\(\), also \},/);
  assert.match(w, /\}, \[applied, rev, ready, also\]\);/);
  assert.match(w, /if \(hiddenLayers\.some\(\(h\) => h\.key === v\)\) setAlso\(\[v\]\); setColourBy\(v\);/);
  assert.match(w, /tr\("\{layer\} \(hidden in 3D\)", \{ layer: h\.label \}\)/);
  assert.equal((v.match(/: !layerVisible\[key\] && !scope\.also\?\.includes\(key\)\) return;/g) || []).length, 2);
  assert.match(v, /customVisible\[layer\.id\] === false && !scope\.also\?\.includes\(`custom:\$\{layer\.id\}`\)\) return;/);
  assert.match(v, /cache: planCacheRef, layerVisible, layers, customLayers, customVisible, isRowVisible,/);
});
