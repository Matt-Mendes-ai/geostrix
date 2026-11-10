// TASKS.csv #1527 — a remount of the 3D view (a language change remounts the app; the store keeps the project) must not write its
// empty starting lists over the store's custom layers and generated surfaces. The effect order is React's; these pin the guards.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const vm = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");

test("the custom-layer mirror waits until the restore has run", () => {
  assert.match(vm, /const customRestoredRef = useRef\(false\), customSeqRef = useRef\(null\);[^\n]*\s*useEffect\(\(\) => \{\s*if \(!customRestoredRef\.current\) return;/);
  assert.match(vm, /if \(!sceneRef\.current\) return;\s*customRestoredRef\.current = true;/);
});

test("the surface mirror writes nothing while a hydration's restored list has not reached it", () => {
  assert.match(vm, /surfaceHydrationRef\.current = \{ seq: viewerUiStateSeq, installed: restored, pending: true \};/);
  assert.match(vm, /if \(surfaceHydrationRef\.current\.installed === implicitSurfaces\) \{ surfaceHydrationRef\.current\.pending = false; return; \}/);
  assert.match(vm, /if \(surfaceHydrationRef\.current\.pending\) return;/);
  assert.doesNotMatch(vm, /DBG1527/);
});
