// TASKS.csv #3029 (from #2936) — the Level plan and the 3D slice say when holes with a suspect collar elevation were left out of their range.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("the Level plan gets the count and says it beside the RL slider; the slice readout says it", () => {
  const v = fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /leftOut=\{tracesRef\.current\.length - mainTraces\(tracesRef\.current, \(t\) => t\.wz\?\.\[0\]\)\.length\}/);
  assert.match(v, /return \{ x0, x1, y0, y1, z0, z1, leftOut: tracesRef\.current\.length - ts\.length \};/);
  assert.match(v, /sliceExtent\?\.leftOut \? tr\(" · \{n\} hole\(s\) with a suspect collar elevation outside the range", \{ n: sliceExtent\.leftOut \}\) : ""/);
  const w = fs.readFileSync(new URL("../src/components/LevelPlanWindow.jsx", import.meta.url), "utf8");
  assert.match(w, /\{leftOut > 0 && <span style=\{\{ \.\.\.ctrl, color: "var\(--color-warn-text\)" \}\}>\{tr\("\{n\} hole\(s\) with a suspect collar elevation are outside this range \(Data QC lists them\)", \{ n: leftOut \}\)\}<\/span>\}/);
});
