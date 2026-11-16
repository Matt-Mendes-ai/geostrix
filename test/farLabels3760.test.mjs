// TASKS.csv #3760 (Scottie Gold review) — in a close plan view on steep ground the hole labels vanished: dropFarLabels (#3588 (7)) measured every label
// against the NEAREST label anywhere, on screen or not. A camera a few hundred metres above the 848 m pads has a pad at 1,030 m on the mountain
// about 1 km away "nearest" by depth, and every label in view was dropped as far. Synthetic pads, a real three.js camera.
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { dropFarLabels, boxOnScreen, labelBoxes, declutterHoleLabels } from "../src/lib/viewer/holeLabels.js";

const W = 1200, H = 800;
const sprite = (x, y, z, hidden = false) => ({ position: { x, y, z }, center: { x: 0.5, y: 0.5 }, material: { userData: {} }, userData: hidden ? { holeHidden: true } : {}, visible: true });
// pads at ~848 m under the camera (scene y is up), one pad at 1,212 m (the SR23-300 pad) a kilometre away that is off screen
const group = () => ({ children: [sprite(0, 848, 0), sprite(40, 850, 15), sprite(-60, 846, -20), sprite(900, 1212, 700)] });
const camera = () => {
  const cam = new THREE.PerspectiveCamera(30, W / H, 1, 20000);
  cam.position.set(0, 848 + 400, 0); cam.up.set(0, 0, -1); cam.lookAt(0, 848, 0); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
  return cam;
};

test("the camera sees the three near pads; the 1,212 m pad is off screen but nearest by depth", () => {
  const g = group(), cam = camera();
  const boxes = labelBoxes(g, cam, W, H, 16);
  assert.ok(boxes.slice(0, 3).every((b) => boxOnScreen(b, { width: W, height: H })), JSON.stringify(boxes));
  assert.equal(boxOnScreen(boxes[3], { width: W, height: H }), false, "the far pad is off screen");
  assert.ok(boxes[3].d < boxes[0].d, `nearest by depth: ${boxes[3].d} < ${boxes[0].d}`);
});

test("the old rule (no viewport) drops every label in view; the viewport rule keeps them", () => {
  const boxes = labelBoxes(group(), camera(), W, H, 16);
  const old = dropFarLabels(boxes);
  assert.equal(old.slice(0, 3).filter(Boolean).length < 3, true, "without the viewport the near pad's labels count as far");
  const now = dropFarLabels(boxes, 5, { width: W, height: H });
  assert.ok(now.slice(0, 3).every(Boolean), "the labels in view stay");
});

test("a real far label in view is still dropped (the Jason pad 8 km behind); one wheel step changes nothing it should not", () => {
  const g = group(); g.children.push(sprite(100, 700, -8000)); // far and in front of the camera's line of sight
  const cam = camera(); cam.far = 30000; cam.updateProjectionMatrix();
  const b = dropFarLabels(labelBoxes(g, cam, W, H, 16), 5, { width: W, height: H });
  assert.ok(b.slice(0, 3).every(Boolean));
  for (const dist of [400, 500, 700, 1000]) { // wheel steps: the camera backs off; the near pads' labels stay on every step
    const c = camera(); c.position.set(0, 848 + dist, 0); c.lookAt(0, 848, 0); c.updateMatrixWorld(); c.updateProjectionMatrix();
    const r = dropFarLabels(labelBoxes(group(), c, W, H, 16), 5, { width: W, height: H });
    assert.ok(r.slice(0, 3).every(Boolean), `at ${dist} m`);
  }
});

test("no label on screen: the old rule over all of them; no view: the old rule", () => {
  const boxes = [{ x: 5000, y: 0, w: 10, h: 10, d: 100 }, { x: 5000, y: 0, w: 10, h: 10, d: 900 }];
  assert.deepEqual(dropFarLabels(boxes, 5, { width: W, height: H }).map((b) => b && b.d), [100, null]);
  assert.deepEqual(dropFarLabels([{ x: 0, y: 0, w: 10, h: 10, d: 100 }, { x: 0, y: 0, w: 10, h: 10, d: 900 }]).map((b) => b && b.d), [100, null]);
});

test("the live declutter: a hidden hole's label decides nothing and keeps its place free", () => {
  const g = group(); g.children.push(sprite(2, 849, 1, true)); // a hidden hole's label, right on the first pad and nearest by depth
  const cam = camera();
  declutterHoleLabels(g, cam, W, H, 16, 0); declutterHoleLabels(g, cam, W, H, 16, 1000);
  assert.deepEqual(g.children.map((sp) => sp.visible), [true, true, true, true, false], "the labels in view stay; the off-screen pad is not dropped as far (it is the nearest); the hidden one stays hidden");
});
