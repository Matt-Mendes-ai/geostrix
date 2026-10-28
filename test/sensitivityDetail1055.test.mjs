// TASKS.csv #1055 — sensitivity realizations must be meshed at the base run's surface detail: at "Fine" the base mesh
// was level 6 and each realization level 4, so a sigma = 0 run reported a p90 "spread" of ~4.5 m from triangulation alone
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("#1055 every GemPy call in modellingRuns passes surfaceDetail", () => {
  const src = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  const calls = src.split("pythonImplicitModel(").slice(1);
  assert.ok(calls.length >= 2, "expected the base run and the realization calls");
  for (const c of calls) {
    const args = c.slice(0, c.indexOf(");"));
    assert.match(args, /\bsurfaceDetail\b/, "a pythonImplicitModel call omits surfaceDetail");
  }
});
