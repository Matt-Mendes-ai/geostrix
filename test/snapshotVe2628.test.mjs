// TASKS.csv #2628 — a Layout snapshot of the 3D view at a vertical exaggeration did not say so; and a frame-aspect capture (a clone of the
// camera) came out at 1x while a same-size one was exaggerated. The capture records the VE it was drawn at, and the page's scale says it.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pageScaleText } from "../src/lib/layoutGeometry.js";

const vp = { id: "vp", type: "viewport", src: "data:x", planView: false, worldHeightAtTarget: 3000, capturedW: 800, capturedH: 600, w: 400, h: 300 };

test("the page's scale names the vertical exaggeration of its snapshot", () => {
  assert.doesNotMatch(pageScaleText([vp]), /exaggeration/);
  assert.match(pageScaleText([{ ...vp, ve: 10 }]), /vertical exaggeration 10×$/);
});

test("the capture records the VE (1 for a true-scale orthographic capture) and the clone is exaggerated too", () => {
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /ve: renderCamera === orthoCamera \? 1 : veOf\(camera\.userData\.ve\)/);
  assert.match(v, /if \(camera\.userData\.ve > 1\) setVerticalExaggeration\(pc, camState, camera\.userData\.ve\);/);
  const s = readFileSync(new URL("../src/lib/store.jsx", import.meta.url), "utf8");
  assert.equal((s.match(/ve: res\.ve > 1 \? res\.ve : 1/g) || []).length, 2, "a new snapshot and a refreshed one");
});
