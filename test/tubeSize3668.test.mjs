// TASKS.csv #3668 — the interval tubes' size choice (Auto / True radius / At least N px / Fixed N px), kept with the view. SYNTHETIC numbers.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { tubeSizeUniforms, tubeFactor, DEFAULT_TUBE_MIN_PX } from "../src/lib/viewer/tubeShader.js";

// a 0.8 m tube seen from 3 km by a 45-degree camera in an 800 px view: 0.8 x 2.414 x 400 / 3000 = 0.26 px
const proj11 = 1 / Math.tan(Math.PI / 8), H = 800, R = 0.8, far = 3000;
const width = (u, depth) => { const px = (R * proj11 * 0.5 * H) / depth; return px * tubeFactor(R, depth, proj11, H, u.min, u.max); };

test("the uniforms of each choice", () => {
  assert.deepEqual(tubeSizeUniforms(undefined), { min: DEFAULT_TUBE_MIN_PX, max: 1e9 });
  assert.deepEqual(tubeSizeUniforms({ mode: "auto" }), { min: 1.5, max: 1e9 });
  assert.deepEqual(tubeSizeUniforms({ mode: "true" }), { min: 0, max: 1e9 });
  assert.deepEqual(tubeSizeUniforms({ mode: "atLeast", px: 4 }), { min: 4, max: 1e9 });
  assert.deepEqual(tubeSizeUniforms({ mode: "fixed", px: 3 }), { min: 3, max: 3 });
  assert.deepEqual(tubeSizeUniforms({ mode: "atLeast", px: 0 }), { min: 1.5, max: 1e9 }, "no width typed: Auto");
});

test("what each choice draws from 3 km out and from 5 m", () => {
  const near = 5, auto = tubeSizeUniforms({ mode: "auto" });
  assert.ok(Math.abs(width(auto, far) - 1.5) < 1e-9, "Auto: the 1.5 px floor");
  assert.ok(width(tubeSizeUniforms({ mode: "true" }), far) < 0.3, "True radius: as thin as it is");
  assert.ok(Math.abs(width(tubeSizeUniforms({ mode: "atLeast", px: 4 }), far) - 4) < 1e-9);
  assert.ok(Math.abs(width(tubeSizeUniforms({ mode: "fixed", px: 3 }), far) - 3) < 1e-9, "Fixed: 3 px far out");
  assert.ok(Math.abs(width(tubeSizeUniforms({ mode: "fixed", px: 3 }), near) - 3) < 1e-9, "Fixed: and 3 px close up (a wide tube is narrowed)");
  assert.ok(width(auto, near) > 100, "Auto close up: the true width");
});

test("wiring: the popover offers it, the overlay sets the uniforms from the view's setting", () => {
  const p = readFileSync(new URL("../src/modules/viewer/ViewerParts.jsx", import.meta.url), "utf8");
  assert.match(p, /<TubeSizeControl figureOverlay=\{figureOverlay\} setFigureOverlay=\{setFigureOverlay\} \/>/);
  const o = readFileSync(new URL("../src/components/ViewportFigureOverlay.jsx", import.meta.url), "utf8");
  assert.match(o, /const u = tubeSizeUniforms\(\{ mode: tubeMode, px: tubePx \}\);/);
  assert.match(o, /TUBE_UNIFORMS\.uTubeMinPx\.value = u\.min; TUBE_UNIFORMS\.uTubeMaxPx\.value = u\.max;/);
});
