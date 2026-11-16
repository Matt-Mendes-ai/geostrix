// TASKS.csv #3855 — a Layout viewport at a fixed scale drew the collar markers as nested rings kilometres wide when the 3D View was zoomed in: the
// orthographic capture's marker floor was divided by the live view's distance. SYNTHETIC numbers.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { collarMarkerFactor, collarMarkerVertex, withMarkerViewport, COLLAR_MARKER_UNIFORMS } from "../src/lib/viewer/collarMarkerShader.js";

// a 1 : 50,000 frame 1,000 px high (half-height 5 km: proj11 = 1 / 5,000); a 3.2 m marker; the floor 2.5 px
const proj11 = 1 / 5000, H = 1000, R = 3.2;

test("orthographic: the marker is drawn at its floor (2.5 px = 25 m here) wherever the camera stands", () => {
  const k = collarMarkerFactor(R, null, proj11, H, 2.5);
  assert.ok(Math.abs(R * k - 25) < 1e-9, String(R * k));
});

test("before: the same frame read as if perspective, from 100 m and from 10 km out", () => {
  const near = collarMarkerFactor(R, 100, proj11, H, 2.5), far = collarMarkerFactor(R, 10000, proj11, H, 2.5);
  assert.ok(R * near > 2400, `${(R * near).toFixed(0)} m: a marker 2.5 km across, cut by the near plane into a ring`);
  assert.ok(R * far > 240000, "and from 10 km out, larger still");
});

test("perspective (the live view) unchanged: depth in the scale", () => {
  // a 45-degree camera (proj11 = 1 / tan 22.5) 500 m out, 800 px: 3.2 m is ~6.2 px, over the floor
  assert.equal(collarMarkerFactor(R, 500, 1 / Math.tan(Math.PI / 8), 800, 2.5), 1);
});

test("the shader guards an orthographic projection as the tubes' does", () => {
  const v = collarMarkerVertex("void main(){\n#include <project_vertex>\n}");
  assert.match(v, /float gsD = projectionMatrix\[3\]\[3\] == 1\.0 \? 1\.0 : max\(1e-6, -gsCentre\.z\);/);
  assert.match(v, /float gsPx = gsR \* projectionMatrix\[1\]\[1\] \* 0\.5 \* uViewportH \/ gsD;/);
});

test("the capture's own frame height while it renders, the live one back after (even on an error)", () => {
  COLLAR_MARKER_UNIFORMS.uViewportH.value = 800;
  assert.equal(withMarkerViewport(2400, () => COLLAR_MARKER_UNIFORMS.uViewportH.value), 2400);
  assert.equal(COLLAR_MARKER_UNIFORMS.uViewportH.value, 800);
  assert.throws(() => withMarkerViewport(2400, () => { throw new Error("x"); }));
  assert.equal(COLLAR_MARKER_UNIFORMS.uViewportH.value, 800);
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /withEveryLabel\(hl, renderCamera, outW, outH, \(\) => withMarkerViewport\(outH, \(\) => renderer\.render\(scene, renderCamera\)\) \/\* #3855 \*\//);
});
