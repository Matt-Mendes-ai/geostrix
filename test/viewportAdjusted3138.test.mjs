// TASKS.csv #3138 (#3018 (a), WA iron review) — a current-view Layout viewport adjusted through 'Enter & adjust view' stored the view
// from BEFORE the session as its viewState, so nothing kept the adjusted camera. The exit now stores the view it captured, marked adjusted.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const s = fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");

test("the interactive exit hands the capture the live (adjusted) view of a themeless viewport", () => {
  const i = s.indexOf("const doExitInteractiveViewport = useCallback(() => {");
  assert.ok(i > 0);
  const f = s.slice(i, s.indexOf("}, [interactiveViewportSession, doCaptureViewportRender]);", i));
  assert.match(f, /doCaptureViewportRender\(req\.themeId \? req : \{ \.\.\.req, exitView: \{ \.\.\.liveViewBundleFromStoreRef\.current\(\), adjusted: true \} \}, liveViewBeforeRender\);/);
  assert.ok(f.indexOf("setInteractiveViewportSession(null);") < f.indexOf("liveViewBundleFromStoreRef.current()"), "read at the exit, before the live view is put back");
});

test("the capture's viewState is the exit view first, then the request's own, then the view from before", () => {
  assert.match(s, /viewState: theme \? null : \(req\.exitView \|\| req\.viewState \|\| liveViewBeforeRender\),/);
  // the live view is still put back after the capture (#202), so the 3D View is not left at the viewport's camera
  const cap = s.slice(s.indexOf("const doCaptureViewportRender = useCallback("), s.indexOf("const doExitInteractiveViewport"));
  assert.ok(cap.includes("applyTheme(liveViewBeforeRender);"));
});
