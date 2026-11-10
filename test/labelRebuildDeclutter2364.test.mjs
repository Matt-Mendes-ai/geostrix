// TASKS.csv #2364 (review #2325, WA uranium) — a label-mode change rebuilds the sprites; the declutter must run again without a camera move
import test from "node:test";
import assert from "node:assert/strict";
import { syncHoleLabels, syncTextLabels, declutterHoleLabels } from "../src/lib/viewer/holeLabels.js";

const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const camera = { matrixWorldInverse: { elements: I }, projectionMatrix: { elements: I }, zoom: 1 };
const sprite = () => ({ visible: true, userData: {}, material: { userData: { labelAspect: 4 } }, position: { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } } });
const group = { children: [], add(s) { this.children.push(s); } };
// two collars 2 m apart (not one site: the #2208 tolerance is 1 m), whose labels overlap at this size
const anchors = [{ id: "A", x: 0, y: 0, z: 0, depth: 50 }, { id: "B", x: 2, y: 0, z: 0, depth: 60 }];
const shown = () => group.children.filter((s) => s.visible).length;
const settle = (t0) => { declutterHoleLabels(group, camera, 2, 2, 16, t0); declutterHoleLabels(group, camera, 2, 2, 16, t0 + 200); };

test("the declutter hides the overlapping label, and again after the labels are rebuilt with the camera still", () => {
  assert.equal(syncHoleLabels(group, anchors, "id", sprite), 2);
  settle(0);
  assert.equal(shown(), 1);
  // a mode change: the same number of sprites, same camera and viewport
  assert.equal(syncHoleLabels(group, anchors, "id_depth", sprite), 2);
  assert.equal(shown(), 2); // new sprites start visible
  settle(1000);
  assert.equal(shown(), 1); // was 2 until the camera moved
});

test("the outcrop / sample text labels too", () => {
  const items = [{ text: "45", x: 0, y: 0, z: 0 }, { text: "50", x: 2, y: 0, z: 0 }];
  syncTextLabels(group, items, sprite); settle(2000); assert.equal(shown(), 1);
  syncTextLabels(group, items, sprite); settle(3000); assert.equal(shown(), 1);
});
