import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// TASKS.csv #1319 — the opening view frames every hole, not the densest drilling, and not a block model 25 km across
const src = readFileSync("src/modules/ViewerModule.jsx", "utf8");
test("the opening fit takes the hole traces, counted before the block models are added", () => {
  assert.match(src, /autoFitInitial = useCallback\(\(traces, nHoles\) => \{ fitView\(nHoles \? traces\.slice\(0, nHoles\) : traces\); \}/);
  const count = src.indexOf("const nHoleTraces = allTraces.length;"), voxels = src.indexOf("(voxelModels || []).forEach((model) => {\n      if (!model.cells?.length) return;\n      const xs = minMax");
  assert.ok(count > 0 && count < voxels);
  assert.match(src, /autoFitInitial\(allTraces, nHoleTraces\)/);
});
test("nothing tightens the view afterwards", () => {
  for (const gone of ["applyLegibilityClamp", "reapplyOpeningFit", "densestCentre", "MIN_OPENING_TUBE_PX", "openingFitRef"]) assert.ok(!src.includes(gone), gone);
  assert.match(src, /const zoomToFitAll = \(\) => fitView\(lastTracesRef\.current\)/);
});
