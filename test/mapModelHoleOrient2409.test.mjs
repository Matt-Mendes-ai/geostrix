// TASKS.csv #2409 (review #2325, WA uranium) — Model from map builds a buried, flat deposit from its logged contacts: with no outcrop orientation,
// each top gets a plane fitted through its own contact points, the panel says so instead of disabling Build, and the run notice lists them
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("the panel: Build stays enabled with 3+ logged contacts in use and no outcrop orientation, and says what the run will do", () => {
  const p = readFileSync(new URL("../src/components/MapModelPanel.jsx", import.meta.url), "utf8");
  assert.match(p, /const holeFit = outcropNone && \(holePreview\?\.contacts\?\.length \|\| 0\) >= 3;/);
  assert.match(p, /const noOrient = outcropNone && !holeFit;/);
  assert.match(p, /No outcrop orientation: each top will get one fitted from its logged contacts \(\{n\} in use\)/);
  assert.match(p, /From drillholes alone: 3D Modelling > Stratigraphic stack or Implicit surface/);
});

test("the run: no outcrop orientation and 3+ logged contacts -> one orientation per top from its contact points, said in a notice", () => {
  const r = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(r, /if \(!orientations\.length && holeN < 3\) \{/);
  assert.match(r, /if \(!orientations\.length\) \{ const e = estimateOrientationFromPoints\(pts\); fittedTops\.push\(/);
  assert.match(r, /No outcrop orientation: \{n\} orientation\(s\) fitted from the logged contacts/);
});
