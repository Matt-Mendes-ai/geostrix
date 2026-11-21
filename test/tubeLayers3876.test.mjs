// TASKS.csv #3876 (#3668's open point) — the interval tubes' size per hole layer: each layer's tube materials use that layer's own uniforms
// (lib/viewer/tubeShader.js tubeUniformsFor / setTubeSizes), set from figureOverlay.tubeSize.byLayer; a layer without its own choice follows the one for all.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TUBE_UNIFORMS, tubeUniformsFor, setTubeSizes, pixelTubeMaterial, DEFAULT_TUBE_MIN_PX } from "../src/lib/viewer/tubeShader.js";

test("each layer's uniforms follow its own choice, or the one for all", () => {
  const litho = tubeUniformsFor("litho"), alt = tubeUniformsFor("alt");
  assert.notEqual(litho, alt);
  assert.equal(tubeUniformsFor("litho"), litho); // one pair per layer
  assert.equal(tubeUniformsFor(null), TUBE_UNIFORMS);
  assert.equal(litho.uViewportH, TUBE_UNIFORMS.uViewportH); // the viewport height is shared
  setTubeSizes({ mode: "atLeast", px: 2, byLayer: { alt: { mode: "fixed", px: 6 } } });
  assert.deepEqual([TUBE_UNIFORMS.uTubeMinPx.value, TUBE_UNIFORMS.uTubeMaxPx.value], [2, 1e9]);
  assert.deepEqual([litho.uTubeMinPx.value, litho.uTubeMaxPx.value], [2, 1e9]);
  assert.deepEqual([alt.uTubeMinPx.value, alt.uTubeMaxPx.value], [6, 6]);
  // a layer first drawn after the setting takes its own choice at once
  setTubeSizes({ mode: "auto", byLayer: { vein: { mode: "true" } } });
  assert.deepEqual([tubeUniformsFor("vein").uTubeMinPx.value, tubeUniformsFor("vein").uTubeMaxPx.value], [0, 1e9]);
  assert.equal(alt.uTubeMinPx.value, DEFAULT_TUBE_MIN_PX); // its own choice removed: back to the one for all
  setTubeSizes(null);
});

test("a material gets its layer's uniforms when it compiles", () => {
  const material = { userData: {}, needsUpdate: false };
  pixelTubeMaterial(material, "sg");
  assert.equal(material.userData.tubeLayer, "sg");
  const sh = { uniforms: {}, vertexShader: "void main(){\n#include <project_vertex>\n}" };
  material.onBeforeCompile(sh);
  assert.equal(sh.uniforms.uTubeMinPx, tubeUniformsFor("sg").uTubeMinPx);
  assert.match(sh.vertexShader, /uniform float uTubeMinPx/);
  const plain = { userData: {} }; pixelTubeMaterial(plain);
  const sh2 = { uniforms: {}, vertexShader: "#include <project_vertex>" }; plain.onBeforeCompile(sh2);
  assert.equal(sh2.uniforms.uTubeMinPx, TUBE_UNIFORMS.uTubeMinPx);
});

test("the batches pass their layer; the view sets every layer; the popover offers a layer list", () => {
  const lb = readFileSync(new URL("../src/lib/viewer/layerBatches.js", import.meta.url), "utf8");
  assert.match(lb, /pixelTubeMaterial\(material, group\.name \|\| null\)/);
  assert.match(lb, /floorTube\(m\.toMesh\(\), group\.name \|\| null\)/);
  const ov = readFileSync(new URL("../src/components/ViewportFigureOverlay.jsx", import.meta.url), "utf8");
  assert.match(ov, /setTubeSizes\(JSON\.parse\(tubeKey\)\);/);
  const ctl = readFileSync(new URL("../src/modules/viewer/TubeSizeControl.jsx", import.meta.url), "utf8");
  assert.match(ctl, /aria-label=\{tr\("Hole layer for the tube size"\)\}/);
  assert.match(ctl, /if \(v\.mode === "same"\) delete byLayer\[layer\]; else byLayer\[layer\] = v;/);
});
