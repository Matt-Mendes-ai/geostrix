// TASKS.csv #2041 (review #2013, Woodjam) — Identify listed a second hit 'Lithology: Lithology' with no hole, value or depth when you clicked a
// lithology tube: the layer's drawn batch mesh, behind the interval's own pick target.
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { describeHits } from "../src/lib/viewer/identify.js";

const obj = (userData, parent = null) => ({ userData, parent, visible: true });
const P = (x, y, z) => new THREE.Vector3(x, y, z);
const group = {};
const ctx = { origin: { x: 0, y: 0, z: 0 }, rayDirection: new THREE.Vector3(0, -1, 0), isHole: (id) => id === "DH24-119", traceOf: () => null, layerOf: (x) => (x.parent === group ? "Lithology" : null), rasterOf: () => null, mapLayerOf: () => null, structureSetOf: () => null, kindOf: () => null };

test("the batch mesh's bare entry goes when the interval itself is under the click", () => {
  const interval = obj({ tip: "DH24-119\nLithology: OB\n0–72 m", row: { hole_id: "DH24-119", from: 0, to: 72, value: "OB" } }, group);
  const batch = obj({}, group); // no row, no tip
  const items = describeHits([{ object: interval, point: P(0, 0, 0), distance: 1 }, { object: batch, point: P(0, -1, 0), distance: 2 }], ctx);
  assert.equal(items.length, 1);
  assert.equal(items[0].hole, "DH24-119");
});

test("a hole's trace line names its hole and the depth at the click (it was a bare 'holes: holes')", () => {
  const holes = {};
  const trace = [{ md: 0, x: 0, y: 0, z: 0 }, { md: 100, x: 0, y: -100, z: 0 }];
  const line = obj({ holeId: "DH24-119" }, holes);
  const [it] = describeHits([{ object: line, point: P(0, -30, 0), distance: 1 }], { ...ctx, layerOf: (x) => (x.parent === holes ? "Drillholes" : null), traceOf: () => trace });
  assert.equal(it.hole, "DH24-119"); assert.ok(!it.bare);
  assert.ok(it.fields.some((f) => /Depth at this point/.test(f[0])));
});

test("a bare entry stays when it is all there is for its layer (nothing else to say it was hit)", () => {
  const batch = obj({}, group);
  const items = describeHits([{ object: batch, point: P(0, 0, 0), distance: 1 }], ctx);
  assert.equal(items.length, 1);
  assert.equal(items[0].bare, true);
});
