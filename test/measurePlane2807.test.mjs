// TASKS.csv #2807 (split from #2526) — a Measure click with nothing under it lands on the flat reference level; the readout now says so,
// so a Δelev of 0 between two such points is not read as flat ground.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const m = fs.readFileSync(new URL("../src/components/MeasureResults.jsx", import.meta.url), "utf8");
const v = fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");

test("the reference-level fall-back marks its point, and the Measure click keeps that point as it is", () => {
  const w = fs.readFileSync(new URL("../src/modules/viewer/worldPoint.js", import.meta.url), "utf8"); // #3838 — the fall-back moved there
  assert.match(w, /on: null, plane: true \}/); assert.match(w, /#2526: not ground/);
  assert.match(v, /const hits = pickHits\(raycaster\), found = worldPointFromHits\(raycaster, hits\);[^\r\n]*\r?\n\s+const world = snapMeasurePoint\(found, hits, tracesRef\.current, \{ shift: e\.shiftKey \}\);[^\r\n]*\r?\n\s+if \(!world\) return;\r?\n\s+setMeasurePts\(\(pts\) => \[\.\.\.pts, world\]\);/);
});

test("the readout counts the points on the reference level and says their elevation is that level's, with one point and with a segment", () => {
  assert.match(m, /const onPlane = pts\.filter\(\(p\) => p\.plane\);/);
  assert.match(m, /"\{n\} point is on the reference level at \{z\} m \(no ground under the click\): its elevation is that level's"/);
  assert.match(m, /\{ n: onPlane\.length, z: onPlane\[0\]\.z\.toFixed\(1\) \}/);
  const distance = m.slice(m.indexOf('if (mode === "distance")'), m.indexOf("// area mode"));
  assert.equal((distance.match(/\{planeNote\}/g) || []).length, 2, "the one-point prompt and the segment readout");
  assert.ok(!m.slice(m.indexOf("// area mode")).includes("{planeNote}"), "an area is in plan: elevation does not enter it");
});
