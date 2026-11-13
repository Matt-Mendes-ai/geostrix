// TASKS.csv #3265 (review #3195, Galore Creek) — every GemPy surface built on a Model area was marked 'source changed' at once: the run
// stamped the area's rows (354 of the log's 1,114), the badge compared with the whole log.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { layerStamp, isStaleStamp } from "../src/lib/layerStamp.js";
import { restrictLayersToHoles } from "../src/lib/modelArea.js";

test("#3265 the area's rows never stamp as the whole log; the run stamps the project's log", () => {
  const litho = [{ hole_id: "A", from: 0, to: 10, value: "V" }, { hole_id: "A", from: 10, to: 30, value: "i9" }, { hole_id: "B", from: 0, to: 20, value: "V" }];
  const area = restrictLayersToHoles({ litho }, { B: false });
  assert.equal(area.litho.length, 2);
  assert.ok(isStaleStamp(layerStamp(area.litho), layerStamp(litho)), "the old stamp: always 'source changed' on a Model area");
  assert.ok(!isStaleStamp(layerStamp(litho), layerStamp(litho)));
  const src = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(src, /lithoStamp: layerStamp\(importStateRef\.current\.layers\?\.litho \?\? layers\.litho\)/);
  assert.ok(!/lithoStamp: layerStamp\(layers\.litho\)/.test(src));
  const vm = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(vm, /const lithoNow = useMemo\(\(\) => layerStamp\(layers\.litho\), \[layers\.litho\]\);/, "the badge compares with the store's whole log");
  assert.match(vm, /importStateRef\.current = \{ survey: store\.survey, layers: store\.layers,/, "importStateRef carries the same store layers");
});
