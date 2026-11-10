// TASKS.csv #2378 (review #2325, WA uranium) — the modelling tools read the unit from a chosen field of the Lithology rows
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { unitSourceFields, applyUnitSource } from "../src/lib/unitSource.js";

// the WA palaeochannel log: rock code as the value, the stratigraphic unit (and oxidation) as extra fields, a description of free text
const litho = [
  { hole_id: "A", from: 0, to: 2.5, value: "SAN", strat: "QA", oxidation: "OX", description: "red sand", recovery: 90 },
  { hole_id: "A", from: 2.5, to: 6, value: "SST", strat: "I", oxidation: "OX", description: "", recovery: 85 },
  { hole_id: "A", from: 6, to: 8, value: "SST", strat: "H", oxidation: "RE", description: "", recovery: 80 },
  { hole_id: "A", from: 8, to: 9, value: "LIG", strat: "", oxidation: "RE", description: "", recovery: 70 },
];

test("the category extra fields are offered, not the reserved keys, free text or numbers", () => {
  const f = unitSourceFields(litho);
  assert.deepEqual(f.map((x) => x.name), ["oxidation", "strat"]);
  assert.equal(f.find((x) => x.name === "strat").distinct, 3);
  assert.deepEqual(unitSourceFields([]), []);
});

test("the chosen field becomes the value, the rock code is kept, blank rows are left out", () => {
  const layers = { litho, alt: [{ hole_id: "A", from: 0, to: 1, value: "SER" }] };
  assert.equal(applyUnitSource(layers, ""), layers);
  const u = applyUnitSource(layers, "strat");
  assert.deepEqual(u.litho.map((r) => [r.value, r.rock]), [["QA", "SAN"], ["I", "SST"], ["H", "SST"]]);
  assert.equal(u.alt, layers.alt);
  assert.equal(layers.litho[0].value, "SAN"); // the store's rows are not changed
});

test("the viewer feeds the chosen units to every modelling tool, the unit lists and the model check", () => {
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /restrictLayersToHoles\(unitLayers, visibleHoles\) : unitLayers/);
  assert.match(v, /const litho_units = distinctValues\(unitLayers\.litho/);
  assert.match(v, /<ModellingPanes \{\.\.\.\{[^\n]* layers: unitLayers, unitField, setUnitField, unitFields,/);
  const m = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(m, /\(unitLitho \|\| importStateRef\.current\.layers\?\.litho \|\| \[\]\)/);
  assert.match(m, /unitsFrom: unitField/);
});
