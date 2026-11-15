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

test("the queue: holds only for two or more files (a single file builds at once); releases at its one end, which a cancel reaches too", () => {
  const imp = readFileSync(new URL("../src/modules/viewer/importPipelineImpl.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const q = imp.slice(imp.indexOf("const processImportQueue = () =>"), imp.indexOf("parseVectorFile(file", imp.indexOf("const processImportQueue = () =>")));
  assert.match(q, /const total = importQueueTotalRef\.current \|\| importQueueRef\.current\.length \+ 1;\n[\s\S]*if \(total > 1\) buildDefer\?\.hold\?\.\(\);/, "a hold only for two or more files");
  assert.match(q, /if \(!file\) \{ importActiveRef\.current = false; batchRowsRef\.current = null; buildDefer\?\.release\?\.\(\)/, "released at the queue's end");
  assert.equal((imp.match(/buildDefer\?\.hold\?\.\(\)/g) || []).length, 1, "held in one place only");
  const hook = readFileSync(new URL("../src/modules/viewer/useImportPipeline.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(hook, /const cancelImport = \(\) => \{\n    setImportModal\(null\);\n[\s\S]*?processImportQueue\(\);/, "a cancel goes on to the queue's end");
  // a single file never holds: the build is not skipped
  const d = buildDeferModel(); d.render();
  assert.equal(d.skip() || d.held(), false);
  // C1: a parsed file's commit in its own task
  assert.match(imp, /askCrsForCollars\(modalData\)\.then\(\(\) => new Promise\(\(r\) => setTimeout\(r, 0\)\) \/\* #3544 \(C1\)/);
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
