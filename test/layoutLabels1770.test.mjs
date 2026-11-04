// TASKS.csv #1770 (review #1645, Copley) — a Layout capture labels every hole: the live declutter's hidden labels are shown for
// the render and put back after, and the labels overlapping another at the capture's size are counted
import test from "node:test";
import assert from "node:assert/strict";
import { labelBoxes, withEveryLabel, labelsToShow } from "../src/lib/viewer/holeLabels.js";

// an orthographic camera looking down -z at the origin: NDC x = x / 100, y = y / 100 (a 200 x 200 m window)
const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const camera = { matrixWorldInverse: { elements: I }, projectionMatrix: { elements: [0.01, 0, 0, 0, 0, 0.01, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1] }, zoom: 1 };
const sprite = (x, y, aspect = 4) => ({ position: { x, y, z: 0 }, visible: true, material: { userData: { labelAspect: aspect } } });

test("#1770 labelBoxes projects each label to pixels with its aspect", () => {
  const group = { visible: true, children: [sprite(0, 0), sprite(50, 0), sprite(0, -100)] };
  const b = labelBoxes(group, camera, 1000, 1000, 16);
  assert.deepEqual(b[0], { x: 0, y: 0, w: 64, h: 16 });
  assert.deepEqual([b[1].x, b[1].y], [250, 0], "50 m east = a quarter of the half-width = 250 px");
  assert.deepEqual([b[2].x, b[2].y], [0, -500]);
});

test("#1770 withEveryLabel shows the hidden labels for the render, puts them back, and counts the overlaps", () => {
  const group = { visible: true, children: [sprite(0, 0), sprite(4, 0), sprite(80, 0)] }; // two labels 4 m (= 20 px) apart: they overlap
  group.children[1].visible = false; // hidden by the live declutter
  let seenVisible = null;
  const n = withEveryLabel(group, camera, 1000, 1000, () => { seenVisible = group.children.map((s) => s.visible); }, 16);
  assert.deepEqual(seenVisible, [true, true, true], "every label is drawn in the capture");
  assert.deepEqual(group.children.map((s) => s.visible), [true, false, true], "the live state is restored");
  assert.equal(n, 1, "one label overlaps another at this size");
  assert.equal(withEveryLabel(null, camera, 1000, 1000, () => {}), 0);
  assert.equal(withEveryLabel({ visible: false, children: [sprite(0, 0)] }, camera, 1000, 1000, () => {}), 0, "labels off: nothing to count");
  // a label that is behind the camera is a null box and never collides
  assert.deepEqual(labelsToShow([null, { x: 0, y: 0, w: 10, h: 10 }]), [false, true]);
});
