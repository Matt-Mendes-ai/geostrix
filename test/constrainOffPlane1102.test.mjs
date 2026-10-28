// TASKS.csv #1102 — a Shift-constrained vertex after an off-image snap lands on the image plane
import { test } from "node:test";
import assert from "node:assert/strict";
import { imagePlane, constrainOnImage } from "../src/lib/sectionDigitize3d.js";

// a vertical image along E at N = 1000 (normal along N), E 0-200, Z 1000 down to 800
const plane = imagePlane([[0, 1000, 1000], [200, 1000, 1000], [200, 1000, 800], [0, 1000, 800]]);
const offOf = (q) => (q.y - 1000) * plane.n[1];

test("#1102 the constrained vertex is on the plane even when prev is 12 m off it", () => {
  const prev = { x: 50, y: 1012, z: 900 }; // a snapped contact 12 m off the image
  const click = { x: 90, y: 1000, z: 903 }; // on the image, nearly horizontal from prev
  const q = constrainOnImage(prev, click, plane);
  assert.ok(Math.abs(offOf(q)) < 1e-9, `off by ${offOf(q)}`);
  assert.ok(Math.abs(q.z - 900) < 1e-9 && Math.abs(q.x - 90) < 1e-9, JSON.stringify(q)); // snapped to horizontal along the image
});

test("#1102 an on-plane prev behaves as before", () => {
  const q = constrainOnImage({ x: 50, y: 1000, z: 900 }, { x: 52, y: 1000, z: 860 }, plane);
  assert.ok(Math.abs(q.x - 50) < 1e-9 && Math.abs(q.z - 860) < 1e-9, JSON.stringify(q)); // vertical
});
