// TASKS.csv #3145 (the rest of #3138 / #3018 (a)) — side 6 stores the camera set in 'Enter & adjust view' on the viewport (viewState.adjusted);
// Layout's Refresh, Fit and a scale change pass it back to the capture of a themeless viewport, so the adjusted view is kept instead of the live
// 3D View's; a button goes back to the live view
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const L = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");

test("startViewportRender passes an adjusted view of a themeless viewport to the capture, unless the caller gives one or asks for the live view", () => {
  assert.match(L, /const target = targetElementId !== "new" && !themeId \? elements\.find\(\(el\) => el\.id === targetElementId\) : null;/);
  assert.match(L, /const keptView = target\?\.viewState\?\.adjusted && !opts\.viewState && !opts\.liveView \? \{ viewState: target\.viewState \} : \{\};/);
  assert.match(L, /requestViewportRender\(themeId, targetElementId, trueScale, false, \{ dpi: PAGE_DPI, \.\.\.keptView, \.\.\.opts \}\);/);
});

test("'Use the live 3D View again' clears the mark and refreshes from the live view", () => {
  assert.match(L, /onLiveView=\{\(\) => \{ updateSelected\(\{ viewState: \{ \.\.\.\(sel\.viewState \|\| \{\}\), adjusted: false \} \}\); startViewportRender\([^\n]*liveView: true \}\); \}\}/);
  assert.match(L, /\{!sel\.themeId && sel\.viewState\?\.adjusted && onLiveView && \(/);
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(new URL(`../src/locales/${lang}.json`, import.meta.url), "utf8"));
    assert.ok(d["Use the live 3D View again"], lang);
  }
});
