// TASKS.csv #3544 — the import queue holds the drillhole build while it commits its files and releases it at its end: one build after the
// queue instead of one per committed file (on the Macpass sample, five builds desurveying every hole twice). Only the drillhole build asks
// held(); a release marks the commit, so the next render's round moves and the held build runs there once.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildDeferModel, HOLD_MAX_MS } from "../src/lib/viewer/buildDefer.js";

test("hold / release: held between them; the release moves the round once; a release with no hold does nothing; skip() unaffected by a hold", () => {
  const d = buildDeferModel();
  d.render();
  const r0 = d.round;
  d.hold();
  assert.equal(d.held(), true);
  assert.equal(d.skip(), false, "the other effects keep their own updates");
  d.render(); d.render(); // commits while held: no round change
  assert.equal(d.round, r0);
  d.release();
  assert.equal(d.held(), false);
  d.render();
  assert.equal(d.round, r0 + 1, "the held build runs in this render");
  d.render();
  assert.equal(d.round, r0 + 1, "once");
  d.release(); d.render();
  assert.equal(d.round, r0 + 1, "a release without a hold: nothing");
  assert.equal(HOLD_MAX_MS, 30000);
});

test("wiring: the hook's hold ends by itself; the drillhole build asks held(); its effect lists the round", () => {
  const b = readFileSync(new URL("../src/lib/viewer/buildDefer.js", import.meta.url), "utf8");
  assert.match(b, /hold: \(\) => \{ held\.current = true; clearTimeout\(holdTimer\.current\); holdTimer\.current = setTimeout\(release, HOLD_MAX_MS\); \}/);
  assert.match(b, /const release = \(\) => \{ clearTimeout\(holdTimer\.current\); holdTimer\.current = null; if \(!held\.current\) return; held\.current = false; mark\(\); \};/);
  const s = readFileSync(new URL("../src/modules/viewer/drillholeScene.js", import.meta.url), "utf8");
  assert.match(s, /if \(!groups\.litho \|\| buildDefer\.skip\(\) \|\| buildDefer\.held\?\.\(\)\) return;/);
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /noHoles && placedSurfaceSamples \/\* #606 — and the no-drillhole camera anchor \*\/, deferRound \/\* #3544 — a held build runs once at its release \*\/\]\);/);
});
