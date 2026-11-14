// TASKS.csv #3243 (split from #3222) — the '<DL %' columns read 'On the floor %' when no result in the file is flagged '<' and the count comes
// from the floor guess (the lowest value read as half a substituted limit)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("Grade stats and Thresholds head the column by where the count comes from", () => {
  const g = readFileSync(new URL("../src/components/GradeStatistics.jsx", import.meta.url), "utf8");
  const t = readFileSync(new URL("../src/components/ThresholdToolkit.jsx", import.meta.url), "utf8");
  assert.match(g, /const floorOnly = useMemo\(\(\) => ltFloor != null && !rows\.some\(\(r\) => r\.lt\), \[ltFloor, rows\]\);/);
  assert.match(t, /const floorOnly = useMemo\(\(\) => floor != null && !data\.some\(flaggedLt\), \[floor, data, symbol\]\);/);
  for (const s of [g, t]) assert.match(s, /\{floorOnly \? tr\("On the floor %"\) : tr\("<DL %"\)\}/);
});
