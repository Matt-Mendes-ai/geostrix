// TASKS.csv #1533 — a hole hidden in the Holes list leaves the 3D view (trace, collar, label) and the sections / level plans
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { viewerSource } from "./helpers/viewerSource.mjs"; // #2176 — the drillhole build moved out of ViewerModule

const v = viewerSource();

test("the trace line carries its hole id, so the visibleHoles effect hides it", () => {
  assert.match(v, /traceHoles\.push\(\{ holeId: c\.hole_id, pts, dashed: assumedVertical \}\);/); // #2176 — a merged chunk knows each hole's range
  assert.match(v, /if \(child\.userData\?\.traceChunk\) \{ hideTraceHoles\(child, visibleHoles\); return; \}/);
  assert.match(v, /const holeId = child\.userData\?\.holeId \?\? /);
});

test("label sprites remember they are hidden and decluttering keeps them so", () => {
  assert.match(v, /if \(child\.isSprite\) child\.userData\.holeHidden = !child\.visible;/);
  const h = readFileSync(new URL("../src/lib/viewer/holeLabels.js", import.meta.url), "utf8");
  assert.match(h, /sp\.visible = !hidden\(sp\) && show\[i\] !== false;/);
});

test("sections and level plans leave hidden holes out", () => {
  assert.match(v, /const holesInBand = tracesRef\.current\.filter\(\(t\) => visibleHoles\[t\.hole_id\] !== false && /);
  assert.match(v, /if \(visibleHoles\[t\.hole_id\] === false\) continue; \/\/ #1533/);
});

test("the moved assay helpers behave as before", async () => {
  const { assaySizeFor, assayPassesCutoff } = await import("../src/lib/viewer/assaySize.js");
  assert.equal(assaySizeFor(5, { min: 0, max: 10 }), 2.5);
  assert.equal(assaySizeFor(1, { min: 1, max: 1 }), 1.2 + 2.6 * 0.3);
  assert.equal(assayPassesCutoff(1, { minCutoff: 2 }), false); assert.equal(assayPassesCutoff(3, {}), true);
});
