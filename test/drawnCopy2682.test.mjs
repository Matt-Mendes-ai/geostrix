// TASKS.csv #2682 (Matt's decision 2026-11-12) — Surface Geology > Unit polygons: a drawn polygon may go onto an imported polygon map layer
// that has a unit field, but onto a COPY of it, never onto the layer the user brought in. SYNTHETIC layers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { offerableForDrawing, drawnCopyOf, addUnitPolygon, removeUnitPolygon, unitFieldOf, geologyPolygonLayer } from "../src/lib/interpretation.js";

const sq = (x, y, d = 100) => [[x, y], [x + d, y], [x + d, y + d], [x, y + d], [x, y]];
const imported = {
  id: "ml1", name: "BCGS geology", geomType: "polygon", styleField: "LITHCODE", fields: ["LITHCODE", "AGE"],
  categories: [{ value: "Kgd", label: "Kgd", color: "#e05a8a", count: 1 }, { value: "uTrSt", label: "uTrSt", color: "#6b7a8f", count: 1 }],
  features: [{ parts: [sq(0, 0)], attributes: { LITHCODE: "Kgd", AGE: "Cretaceous" } }, { parts: [sq(200, 0)], attributes: { LITHCODE: "uTrSt", AGE: "Triassic" } }],
  bbox: [0, 0, 300, 100],
};

test("which layers are offered: imported polygon layers coloured by a unit field, not graduated, not drawn ones", () => {
  assert.equal(offerableForDrawing(imported), true);
  assert.equal(offerableForDrawing({ ...imported, styleBreaks: [1, 2] }), false);
  assert.equal(offerableForDrawing({ ...imported, styleField: null }), false);
  assert.equal(offerableForDrawing({ ...imported, geomType: "polyline" }), false);
  assert.equal(offerableForDrawing({ ...geologyPolygonLayer("x"), features: [{ parts: [sq(0, 0)], attributes: { unit: "A" } }] }), false);
});

test("the copy: every feature kept, its own unit field, a new name; the original is untouched by drawing on the copy", () => {
  const before = JSON.stringify(imported);
  const copy = drawnCopyOf(imported, [imported, { name: "BCGS geology (with drawn units)" }]);
  assert.equal(copy.id, undefined); // the store gives it an id of its own
  assert.equal(copy.name, "BCGS geology (with drawn units) 2");
  assert.equal(copy.drawnGeology, true);
  assert.equal(copy.copiedFrom, "BCGS geology");
  assert.equal(unitFieldOf(copy), "LITHCODE");
  assert.equal(copy.features.length, 2);
  const next = addUnitPolygon(copy, [{ x: 400, y: 0 }, { x: 500, y: 0 }, { x: 500, y: 100 }], { unit: "Kgd", note: "drawn" });
  assert.equal(next.features.length, 3);
  assert.deepEqual(next.features[2].attributes, { LITHCODE: "Kgd", area_m2: 5000, note: "drawn" });
  assert.deepEqual(next.categories.map((c) => [c.value, c.count]), [["Kgd", 2], ["uTrSt", 1]]); // the imported units still counted, by LITHCODE
  next.features[0].parts[0][0][0] = -999; // a deep copy: the imported layer's vertices are not shared
  assert.equal(JSON.stringify(imported), before);
  const back = removeUnitPolygon(next, 2);
  assert.deepEqual(back.categories.map((c) => [c.value, c.count]), [["Kgd", 1], ["uTrSt", 1]]);
  // a layer drawn here keeps 'unit'
  assert.equal(unitFieldOf(geologyPolygonLayer("Geology (drawn)")), "unit");
  assert.deepEqual(addUnitPolygon(geologyPolygonLayer("g"), [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], { unit: "A" }).features[0].attributes.unit, "A");
});

test("the pane offers the copies, makes the copy on the first polygon and says so", () => {
  const p = readFileSync(new URL("../src/components/UnitPolygonPane.jsx", import.meta.url), "utf8");
  assert.match(p, /const imported = useMemo\(\(\) => mapLayers\.filter\(offerableForDrawing\), \[mapLayers\]\);/);
  assert.match(p, /<option key=\{l\.id\} value=\{`copy:\$\{l\.id\}`\}>\{tr\("Copy of \\"\{name\}\\" \(\{field\}\)"/);
  assert.match(p, /if \(!target && copySrc\) \{ \/\/ #2682 — the copy, never the imported layer itself\s+target = drawnCopyOf\(copySrc, mapLayers\);\s+id = addMapLayer\(target\); setLayerPick\(id\);/);
  assert.doesNotMatch(p, /updateMapLayer\(copySrc/);
  assert.match(p, /<button type="button" onClick=\{\(\) => finish\(\)/); // Finish: the click event is not closedOnFirst (it dropped the last corner)
  assert.doesNotMatch(p, /onClick=\{finish\}/);
});
