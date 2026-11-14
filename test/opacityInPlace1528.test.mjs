// TASKS.csv #1528 (review #1497, Lawyers) — opacity in place, no desurvey rebuild without a survey, debounced style sliders
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
const modal = readFileSync(new URL("../src/components/LayerStyleModal.jsx", import.meta.url), "utf8");

test("the big build reads the style key without the in-place opacities", () => {
  assert.ok(src.includes(", fitView, layerStylesBuildKey /* #635; #1528 — not the in-place opacities */,"));
  assert.ok(!src.includes(", fitView, layerStyles /* #635 */,"));
  assert.ok(src.includes('.filter(([, v]) => v && JSON.stringify(v) !== "{}")'), "a first opacity change is not a new style");
  assert.ok(src.includes("if (g) applyGroupOpacity(g, op);"));
});

test("mineralization and structures keep the rebuild (mixed opacities)", () => {
  const line = src.split("\n").find((l) => l.startsWith("const FAST_OPACITY_KEYS = "));
  assert.ok(line && !line.includes('"mnlgy"') && !line.includes('"structure"'));
});

test("desurvey method matters only with a survey (#2371: one where a hole's survey has two attitudes)", () => {
  assert.ok(src.includes('desurveyBites ? desurveyMethod : ""'));
});

test("Size and Opacity commit once the slider rests", () => {
  assert.ok(modal.includes('onChange={slide("size")}') && modal.includes('onChange={slide("opacity")}'));
  assert.ok(modal.includes("}, 150);"));
});
