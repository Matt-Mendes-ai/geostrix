// TASKS.csv #3065 — a block model estimated from the checked holes before #3006 keeps flags that counted every unchecked hole as unsampled
// drilling; new estimates record which holes the test used, and the pit tools say when a model's flags may be stale
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { nearUnsampledMayBeStale, NEAR_UNSAMPLED_HOLES } from "../src/lib/unsampledFlags.js";

test("stale only when flagged, estimated from the checked holes, and without the record of which holes the test used", () => {
  const old = { nearUnsampledFlagged: true, samplesFrom: "holes checked in the Holes list (12 of 40)" };
  assert.equal(nearUnsampledMayBeStale(old), true);
  assert.equal(nearUnsampledMayBeStale({ ...old, nearUnsampledHoles: NEAR_UNSAMPLED_HOLES }), false, "a new estimate");
  assert.equal(nearUnsampledMayBeStale({ ...old, samplesFrom: "every hole" }), false, "every hole: the test was right then too");
  assert.equal(nearUnsampledMayBeStale({ samplesFrom: old.samplesFrom }), false, "not flagged");
  assert.equal(nearUnsampledMayBeStale({ nearUnsampledFlagged: true }), false, "no samplesFrom (before #2544): every hole");
  assert.equal(nearUnsampledMayBeStale(null), false);
});

test("wiring: the estimate records the holes; the Pit shell, Pit design and Nested pits say it under the never-sampled line", () => {
  const src = (f) => readFileSync(new URL(`../src/components/${f}`, import.meta.url), "utf8");
  assert.match(src("GradeEstimationModal.jsx"), /nearUnsampledHoles: NEAR_UNSAMPLED_HOLES,/);
  const shell = src("PitShellPane.jsx");
  assert.match(shell, /const nearUnsStale = nearUnsFlagged && nearUnsampledMayBeStale\(model\.params\);/);
  assert.match(shell, /nearUnsFlagged, nearUnsStale \/\* #3065 \*\//);
  assert.match(shell, /res\.nearUnsFlagged && nearUnsP > 0 && res\.nearUnsStale && <div style=\{note\}>\{tr\("This block model was estimated from the checked holes/);
  for (const f of ["PitDesignPane.jsx", "NestedPitsPane.jsx"]) assert.match(src(f), /\{nearUnsampledMayBeStale\(model\?\.params\) && <div style=\{note\}>\{tr\("This block model was estimated from the checked holes/, f);
});
