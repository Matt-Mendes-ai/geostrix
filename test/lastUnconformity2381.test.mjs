// TASKS.csv #2381 (review #2325, WA uranium) — an unconformity above the last unit of a stack makes no package: not offered, and a stale
// one is left out of the run with a word, so the run no longer says "1 conformable package" and then runs erosional
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { surfacePackages } from "../src/lib/viewer/stackPackages.js";

test("a break above the last of six units starts no package; one above the fifth does", () => {
  assert.deepEqual(surfacePackages(6, new Set([4])), [0, 0, 0, 0, 0, 0]); // the review's E2 | Basement
  assert.deepEqual(surfacePackages(6, new Set([3])), [0, 0, 0, 0, 0, 1]);
});

test("the run leaves such a break out and says so; the pane does not offer it", () => {
  const m = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(m, /const noPackageBelow = \[\.\.\.breakAt\]\.filter\(\(b\) => b >= specs\.length - 2\);/);
  assert.match(m, /The unconformity marked above the last unit \(\{unit\}\) was left out/);
  // it runs before the packages are counted and the relation chosen (breakAt.size)
  assert.ok(m.indexOf("const noPackageBelow") < m.indexOf("const moved = movePointsToUnconformities(specs"));
  const p = readFileSync(new URL("../src/modules/viewer/ModellingPanes.jsx", import.meta.url), "utf8");
  assert.match(p, /\{i < stackUnits\.length - 1 && \(i < stackUnits\.length - 2 \|\| hasBreak\) && \(/);
  assert.match(p, /No unconformity above the last unit/);
});
