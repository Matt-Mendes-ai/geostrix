// TASKS.csv #1546 (review #1497, Lawyers) — Model area: the modelling tools read only the holes checked in the Holes list,
// and a fit notice whose typical miss exceeds half a cell points to a smaller area before a finer detail
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { restrictLayersToHoles, checkedHoleCount, missOverHalfCell } from "../src/lib/modelArea.js";

test("the drillhole layers keep only the checked holes; rows with no hole id and non-array entries pass through", () => {
  const layers = {
    litho: [{ hole_id: "AGB1", from: 0, to: 5, value: "V" }, { hole_id: "CC1", from: 0, to: 5, value: "V" }, { hole_id: "DR1", from: 0, to: 5, value: "V" }],
    structure: [{ hole_id: "CC1", depth: 3 }, { hole_id: "DR1", depth: 4 }],
    geophys_pts: [{ x: 1, y: 2, value: 5 }],
    note: "not a list",
  };
  const vis = { AGB1: false, DR1: false }; // unchecked = false; absent = checked
  const r = restrictLayersToHoles(layers, vis);
  assert.deepEqual(r.litho.map((x) => x.hole_id), ["CC1"]);
  assert.deepEqual(r.structure.map((x) => x.hole_id), ["CC1"]);
  assert.equal(r.geophys_pts.length, 1);
  assert.equal(r.note, "not a list");
  assert.deepEqual(restrictLayersToHoles(layers, {}).litho.length, 3, "nothing unchecked: everything");
  assert.deepEqual(restrictLayersToHoles(layers, null).litho.length, 3);
  assert.deepEqual(checkedHoleCount([{ hole_id: "AGB1" }, { hole_id: "CC1" }, { hole_id: "DR1" }], vis), { checked: 1, all: 3 });
});

test("the half-cell rule", () => {
  assert.equal(missOverHalfCell({ typical: 42, cell: 249 }), false); // Lawyers' V-Ash Tuff: 42 m typical in 249 m cells
  assert.equal(missOverHalfCell({ typical: 150, cell: 249 }), true);
  assert.equal(missOverHalfCell({ typical: 30.2, cell: 239 }), false);
  assert.equal(missOverHalfCell(null), false);
});

test("the viewer feeds the modelling tools the checked holes when Model area says so; the pane offers it; the fit notice advises", () => {
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /const modelLayers = useMemo\(\(\) => \(modelArea === "checked" \? restrictLayersToHoles\(unitLayers, visibleHoles\) : unitLayers\), \[unitLayers, modelArea, visibleHoles\]\);/);
  assert.match(v, /    layers: modelLayers, \/\/ TASKS\.csv #1546/);
  assert.match(v, /modelDomainId, modelArea, setModelArea, \/\* #1546 \*\/ modelResolution,/);
  const p = readFileSync(new URL("../src/modules/viewer/ModellingPanes.jsx", import.meta.url), "utf8");
  assert.match(p, /aria-label=\{tr\("Model area"\)\}/);
  assert.match(p, /Holes checked in the Holes list \(\{n\} of \{m\}\)/);
  const r = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(r, /v: missOverHalfCell\(fit\) \? tr\(" The typical miss is more than half a cell: model a smaller area \(Model settings › Model area, the holes of one prospect\) before a finer detail\."\) : ""/);
});
