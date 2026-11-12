// TASKS.csv #2689 (#2675 part 2) — the drill thresholds saved in Geochem are offered beside the Grade shell's level, never applied by themselves
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { drillThresholdOffers } from "../src/lib/thresholds.js";

test("#2689: the Grade shell pane offers the saved drill thresholds of its element as buttons that fill the level", () => {
  const recs = [{ source: "drill", symbol: "U", unit: "ppm", values: { all: 150 }, method: "mad", methodLabel: "Median + 2 MAD", decided: "2026-11-09" }];
  assert.deepEqual(drillThresholdOffers(recs, "U", "ppm").map((o) => o.value), [150]);
  assert.deepEqual(drillThresholdOffers(recs, "Li", "%"), []);
  const s = fs.readFileSync("src/modules/viewer/ModellingPanes.jsx", "utf8");
  assert.match(s, /drillThresholdOffers\(geochemThresholds, sym, unit\)\.slice\(0, 4\)/);
  assert.match(s, /onClick=\{\(\) => setNumericCutoff\(o\.value\)\}/);
  assert.match(s, /\{!numSrc && \(\(\) => \{ const offers = drillThresholdOffers/, "assays only, not a log or a numeric layer");
});
