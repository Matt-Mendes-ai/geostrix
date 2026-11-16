// TASKS.csv #2526 (review #2486, WA lithium) — over open ground the status bar's Z was the scene's reference plane (the mean collar,
// 248.6 m) wherever the cursor was: a level, not the ground. Z now reads '—' there; over a hole, terrain or model it is the hit's.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("#2526 the plane fallback is marked and the cursor readout drops its Z", () => {
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  const w = readFileSync(new URL("../src/modules/viewer/worldPoint.js", import.meta.url), "utf8"); // #3838 — the fall-back moved there
  assert.match(w, /z: o\.z, on: null, plane: true \}/);
  assert.match(v, /if \(worldPt\) setCursor\(worldPt\.plane \? \{ \.\.\.worldPt, z: null \} : worldPt\);/);
  assert.match(readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8"), /const fmt = \(v\) => \(v == null \? "—"/);
});
