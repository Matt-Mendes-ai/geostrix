// TASKS.csv #1500 — the 3D scene is built once on a project open, not twice: a build in the commit where a restore effect has only
// scheduled its state is skipped; the next render's build (with the restored values) runs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildDeferModel } from "../src/lib/viewer/buildDefer.js";

test("a mark skips the build of its own commit only", () => {
  const d = buildDeferModel();
  d.render(); assert.equal(d.skip(), false); // nothing marked: build
  d.render(); d.mark(); assert.equal(d.skip(), true); // the restore ran first in this commit: skip
  d.render(); assert.equal(d.skip(), false); // the re-render with the restored state: build
  d.render(); d.mark(); // marked in a commit whose build did not run ...
  d.render(); assert.equal(d.skip(), false); // ... cannot swallow the next one
});

test("the viewer marks in the UI-state restore and the custom-layer restore, and the build checks", () => {
  const s = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(s, /lastHydratedSeq\.current = viewerUiStateSeq;\n {4}buildDefer\.mark\(\);/);
  assert.match(s, /if \(!missing\.length\) return;\n {4}buildDefer\.mark\(\);/);
  assert.match(s, /if \(!groups\.litho \|\| buildDefer\.skip\(\)\) return;/);
  // the effects that mark are declared before the build effect, so they run before it in a commit
  assert.ok(s.indexOf("buildDefer.mark();") < s.indexOf("buildDefer.skip()"));
  assert.ok(s.lastIndexOf("buildDefer.mark();") < s.indexOf("buildDefer.skip()"));
});

test("the assay, geophysics and surface-sample builders also skip a deferred commit; the big build that follows rebuilds them", () => {
  const s = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  for (const [built, inputs, ref] of [["assayBuiltRef", "assayInputs", "buildAssaySpheresRef"], ["geophysBuiltRef", "geophysInputs", "buildGeophysPtsRef"], ["surfaceBuiltRef", "surfaceInputs", "buildSurfaceSamplesRef"]]) {
    assert.ok(s.includes(`useEffect(() => { if (!buildDefer.skip() && !sameInputs(${built}.current, ${inputs})) ${ref}.current(); }, ${inputs});`), ref);
  }
  assert.ok(s.includes("buildAssaySpheresRef.current(); buildGeophysPtsRef.current(); buildSurfaceSamplesRef.current();"));
});
