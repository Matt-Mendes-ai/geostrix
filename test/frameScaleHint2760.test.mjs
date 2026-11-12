// TASKS.csv #2760 — a page whose maps are at different scales offers each frame's own scale caption
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const m = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");

test("the hint shows when another frame has another scale and this one prints none, with a one-click fix", () => {
  assert.match(m, /\{scaleText && !sel\.scaleCaption && others\.some\(\(o\) => \{ const t = viewportScaleText\(o\); return t && t !== scaleText; \}\) && \(/);
  assert.match(m, /onClick=\{\(\) => updateSelected\(\{ scaleCaption: true \}\)\}/);
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(new URL(`../src/locales/${lang}.json`, import.meta.url), "utf8"));
    assert.ok(d["Print it"], lang);
  }
});
