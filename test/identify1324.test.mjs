import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { describeHits, voxelCellAt, mapFeatureAt, rasterValueAt, depthOnTrace, attributeFields, identifyText } from "../src/lib/viewer/identify.js";

const obj = (userData, parent = null, visible = true) => ({ userData, parent, visible });
const ctx = (over = {}) => ({ origin: { x: 1000, y: 2000, z: 500 }, rayDirection: new THREE.Vector3(0, -1, 0), isHole: (id) => id === "H1", traceOf: () => null, layerOf: () => null, rasterOf: () => null, mapLayerOf: () => null, structureSetOf: () => null, terrainMesh: null, kindOf: () => null, tolerance: () => 5, ...over });
const P = (x, y, z) => new THREE.Vector3(x, y, z);

test("#1324 a drillhole interval: its layer, its hole, its depths, its other columns; world coordinates in E N Z", () => {
  const group = {}, o = obj({ tip: "H1\nLithology: VCL\n2–18 m", row: { hole_id: "H1", from: 2, to: 18, value: "VCL", comment: "altered", sample_id: "S1", values: {}, modelColor: "#000" } }, group);
  const [it] = describeHits([{ object: o, point: P(10, 20, -30), distance: 5 }], ctx({ layerOf: (x) => (x.parent === group ? "Lithology" : null) }));
  assert.equal(it.layer, "Lithology");
  assert.equal(it.title, "H1");
  assert.equal(it.hole, "H1");
  const f = Object.fromEntries(it.fields);
  assert.equal(f.Hole, "H1"); assert.equal(f.Value, "VCL"); assert.equal(f.From, "2 m"); assert.equal(f.To, "18 m"); assert.equal(f.Length, "16 m");
  assert.equal(f.comment, "altered"); assert.equal(f.sample_id, "S1");
  assert.ok(!("modelColor" in f));
  assert.deepEqual([it.world.e, it.world.n, it.world.z], [1010, 2030, 520]);
  assert.match(identifyText(it), /Lithology\nH1\n/);
});
test("#1324 nearest first; one entry per object; what is hidden does not answer, by itself or through its group", () => {
  const group = {}, a = obj({ tip: "A\nx" }), b = obj({ tip: "B\ny" }), hidden = obj({ tip: "C\nz" }, null, false), inGroup = obj({ tip: "D\nz" }, { visible: false });
  const hits = [{ object: b, point: P(0, 0, 0), distance: 9 }, { object: a, point: P(0, 0, 0), distance: 2 }, { object: a, point: P(0, 0, 0), distance: 3 }, { object: hidden, point: P(0, 0, 0), distance: 1 }, { object: inGroup, point: P(0, 0, 0), distance: 1 }];
  assert.deepEqual(describeHits(hits, ctx()).map((i) => i.title), ["A", "B"]);
  assert.equal(group.x, undefined);
});
test("#1324 a hole seen through a block model is what was clicked; the model is still listed", () => {
  const group = {}, tube = obj({ tip: "H1\nLithology: VCL\n2–18 m", row: { hole_id: "H1", from: 2, to: 18 } }, group);
  const model = { name: "ZTEM", dx: 10, dy: 10, dz: 10, cells: [{ x: 1000, y: 2000, z: 500, value: 1 }] };
  const items = describeHits([{ object: obj({ srcModel: model }), point: P(0, 0, 0), distance: 1 }, { object: tube, point: P(0, 0, 0), distance: 8 }], ctx({ layerOf: (x) => (x.parent === group ? "Lithology" : null) }));
  assert.deepEqual(items.map((i) => i.title), ["H1", "ZTEM"]);
});
test("#1324 a block model answers with the block under the click", () => {
  const model = { name: "ZTEM", dx: 100, dy: 100, dz: 50, cells: [{ x: 1000, y: 2000, z: 500, value: 0.5 }, { x: 1100, y: 2000, z: 500, value: 0.9, dx: 100, dy: 100, dz: 50 }] };
  assert.equal(voxelCellAt(model, 1120, 2010, 490).value, 0.9);
  const [it] = describeHits([{ object: obj({ srcModel: model }), point: P(120, 0, -10), distance: 3 }], ctx());
  assert.equal(it.title, "ZTEM");
  assert.equal(Object.fromEntries(it.fields).Value, "0.9");
  const labelled = { ...model, valueLabels: { 0.9: "Andesite" } };
  assert.equal(Object.fromEntries(describeHits([{ object: obj({ srcModel: labelled }), point: P(120, 0, -10), distance: 3 }], ctx())[0].fields).Value, "Andesite");
});
test("#1324 a map layer answers only where a feature is: its image covers the whole box", () => {
  const poly = { geomType: "polygon", features: [{ parts: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]], attributes: { unit: "Basalt" } }] };
  assert.equal(mapFeatureAt(poly, 5, 5, 1).attributes.unit, "Basalt");
  assert.equal(mapFeatureAt(poly, 15, 5, 1), null);
  const line = { geomType: "polyline", features: [{ parts: [[[0, 0], [10, 0]]], attributes: { name: "F1" } }] };
  assert.equal(mapFeatureAt(line, 5, 0.5, 1).attributes.name, "F1");
  assert.equal(mapFeatureAt(line, 5, 3, 1), null);
  const pts = { geomType: "point", features: [{ parts: [[3, 3]], attributes: { n: "a" } }, { parts: [[6, 6]], attributes: { n: "b" } }] };
  assert.equal(mapFeatureAt(pts, 5.5, 5.5, 2).attributes.n, "b");
  const c = ctx({ mapLayerOf: () => ({ ...poly, name: "Geology" }), origin: { x: 0, y: 0, z: 0 } });
  assert.equal(describeHits([{ object: obj({}), point: P(50, 0, -50), distance: 1 }], c).length, 0);
  const [it] = describeHits([{ object: obj({}), point: P(5, 0, -5), distance: 1 }], c);
  assert.equal(it.title, "Geology");
  assert.deepEqual(it.fields, [["unit", "Basalt"]]);
});
test("#1324 raster value, down-hole depth, readable attributes", () => {
  const grid = { nx: 2, ny: 2, x0: 0, yTop: 10, dx: 10, dy: 10, values: Float32Array.from([1, 2, NaN, 4]) };
  assert.equal(rasterValueAt(grid, 10, 10), 2);
  assert.equal(rasterValueAt(grid, 0, 0), null, "no data");
  assert.equal(rasterValueAt(grid, 99, 0), null, "outside");
  assert.equal(rasterValueAt({}, 0, 0), null);
  assert.equal(depthOnTrace([{ x: 0, y: 0, z: 0, md: 0 }, { x: 0, y: -100, z: 0, md: 100 }], { x: 3, y: -40, z: 0 }), 40);
  assert.deepEqual(attributeFields({ a: 1.23456, b: "x", c: null, d: {}, _e: 1, hole_id: "H" }), [["a", "1.2346"], ["b", "x"]]);
});
