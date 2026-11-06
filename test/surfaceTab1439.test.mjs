// TASKS.csv #1439 (review #1352, Silvertip) — the Surface Geology tab gets the field data's tools: unit polygons drawn in the app
// (a geology map layer with a unit field), Interpret, Identify and the rock chips' style
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { geologyPolygonLayer, addUnitPolygon, removeUnitPolygon, isDrawnGeologyLayer } from "../src/lib/interpretation.js";

test("a drawn geology layer: polygon map layer with a unit field; a polygon closes, carries its area and a colour per unit", () => {
  const l0 = geologyPolygonLayer("");
  assert.equal(l0.name, "Geology (drawn)"); assert.equal(l0.geomType, "polygon"); assert.equal(l0.styleField, "unit"); assert.ok(isDrawnGeologyLayer(l0));
  const sq = [{ x: 0, y: 0, z: 100 }, { x: 100, y: 0, z: 102 }, { x: 100, y: 100, z: 101 }, { x: 0, y: 100, z: 99 }];
  const l1 = addUnitPolygon(l0, sq, { unit: "Basalt", note: "pillow lavas" });
  assert.equal(l1.features.length, 1);
  assert.deepEqual(l1.features[0].parts[0], [[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]]); // closed back to the first corner
  assert.deepEqual(l1.features[0].attributes, { unit: "Basalt", area_m2: 10000, note: "pillow lavas" });
  assert.equal(l1.elevation, 100.5); // the first polygon sets the layer's flat elevation (no terrain) to the clicks' median
  assert.deepEqual(l1.bbox, [0, 0, 100, 100]);
  assert.equal(l1.categories.length, 1); assert.equal(l1.categories[0].value, "Basalt"); assert.equal(l1.categories[0].count, 1); assert.match(l1.categories[0].color, /^(#[0-9a-f]{6}|hsl[(])/i);
  // a double-click on the first corner is dropped, not a fifth corner; a second unit gets its own category, the first keeps its colour
  const l2 = addUnitPolygon(l1, [{ x: 200, y: 0 }, { x: 300, y: 0 }, { x: 250, y: 50 }, { x: 200, y: 0 }], { unit: "Rhyolite" });
  assert.equal(l2.features[1].parts[0].length, 4);
  assert.equal(l2.features[1].attributes.area_m2, 2500);
  assert.deepEqual(l2.categories.map((c) => [c.value, c.count]), [["Basalt", 1], ["Rhyolite", 1]]);
  assert.equal(l2.categories[0].color, l1.categories[0].color);
  assert.equal(addUnitPolygon(l2, [{ x: 0, y: 0 }, { x: 1, y: 1 }], { unit: "X" }), l2); // too few corners: unchanged
  assert.equal(addUnitPolygon(l0, sq, {}).features[0].attributes.unit, "Unit");
  const l3 = removeUnitPolygon(l2, 0);
  assert.deepEqual(l3.categories.map((c) => [c.value, c.count]), [["Basalt", 0], ["Rhyolite", 1]]);
  assert.deepEqual(l3.bbox, [200, 0, 300, 50]);
});

test("the Surface Geology ribbon carries Unit polygons, Interpret, Identify and Rock chips; the viewer mounts it and the pane", () => {
  const parts = readFileSync(new URL("../src/modules/viewer/ViewerParts.jsx", import.meta.url), "utf8");
  assert.match(parts, /export function SurfaceRibbon\(\{ show, paneProps, onStereonet, onModelIt, identifyOn, onToggleIdentify, interpretOpen, onInterpret, onPolygons, onStyleSamples, sampleCount = 0 \}\)/);
  for (const l of ["Unit polygons", "Interpret", "Identify", "Rock chips", "Geology map", "Outcrop structures", "Stereonet", "Model it"]) assert.ok(parts.includes(`label="${l}"`), l);
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /\{mode === "surface" && <SurfaceRibbon show=\{visible\}/);
  assert.ok(!v.includes('label="Surface geology tools"'), "the surface ribbon left ViewerModule");
  assert.match(v, /const openInterpret = \(kind\) => \{ if \(interpretOpen\) stopInterpret\(\); setInterpretOpen\(\(v\) => \(v === kind \? false : kind\)\); \};/);
  assert.match(v, /React\.createElement\(interpretOpen === "polygon" \? UnitPolygonPane : InterpretPane/);
  assert.equal((v.match(/\{interpretPane\}/g) || []).length, 2, "the pane on the 3D View and the Surface Geology sidebars");
  assert.match(v, /onToggleIdentify=\{toggleIdentify\}/);
  const pane = readFileSync(new URL("../src/components/UnitPolygonPane.jsx", import.meta.url), "utf8");
  assert.match(pane, /TaskPaneHeader title=\{tr\("Unit polygons"\)\} helpId="unit-polygons"/);
  assert.match(pane, /if \(n < 3\) \{ setMsg\(tr\("A polygon needs at least three points\."\)\); return; \}/);
});
