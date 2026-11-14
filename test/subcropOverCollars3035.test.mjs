// TASKS.csv #3035 (#2956) — at Top / Fit the collar markers sat on the subcrop points (the map of what each hole met under cover) and the map
// read as black blobs with a coloured fringe. The subcrop point layer is drawn after the collar markers and traces, with no depth test.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { syncMapLayers } from "../src/lib/viewer/sceneBuilders.js";
import { subcropLayer } from "../src/lib/collarSubcrop.js";
import { DRAW_ORDER } from "../src/lib/viewer/drawOrder.js";

const pts = [{ hole_id: "H1", unit: "B", from: 12, to: 40, cover: 12, x: 100, y: 200, z: 488 }, { hole_id: "H2", unit: "V3", from: 8, to: 30, cover: 8, x: 300, y: 200, z: 492 }];
const origin = { x: 0, y: 0, z: 0 };

test("the subcrop points draw after the collar markers, through them", () => {
  const sub = { ...subcropLayer(pts, "Subcrop from collars"), id: "s1" };
  const group = new THREE.Group(), cache = {};
  syncMapLayers(group, cache, [sub], { origin, terrain: null });
  const obj = cache.s1;
  assert.ok(obj?.isPoints);
  assert.ok(obj.renderOrder > DRAW_ORDER.collars && obj.renderOrder > DRAW_ORDER.traces);
  assert.equal(obj.material.depthTest, false);
});

test("other point layers at their own elevation keep the depth test and their place", () => {
  const other = { ...subcropLayer(pts, "Stations"), subcropFromCollars: false, id: "o1" };
  const group = new THREE.Group(), cache = {};
  syncMapLayers(group, cache, [other], { origin, terrain: null });
  assert.equal(cache.o1.renderOrder, 2);
  assert.equal(cache.o1.material.depthTest, true);
});
