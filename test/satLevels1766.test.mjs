// TASKS.csv #1766 — Sentinel-2 on a small area: Standard, High and Very high all planned '~10 m pixels · image 293 x 267 px'. The levels that
// would fetch the same grid as a lower level are now disabled and say why.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { levelsAddingNothing, planLatestFetch } from "../src/lib/imageryLevels.js";

const small = [-120.5, 50.6, -120.46, 50.624]; // ~2.8 x 2.7 km: 10 m pixels at every level
const large = [-121, 50, -119, 51]; // ~142 x 111 km: every level differs

test("a small area: High and Very high add nothing for Sentinel-2, but do for NAIP's 0.6 m", () => {
  assert.deepEqual([...levelsAddingNothing(small)], ["high", "veryhigh"]);
  assert.equal(planLatestFetch(small, "standard").gridW, planLatestFetch(small, "veryhigh").gridW);
  assert.deepEqual([...levelsAddingNothing(small, 0.6)], []);
});

test("a large area: every level differs; no area: nothing disabled", () => {
  assert.deepEqual([...levelsAddingNothing(large)], []);
  assert.deepEqual([...levelsAddingNothing(null)], []);
});

test("the select disables them (the chosen one stays selectable) and says why", () => {
  const src = readFileSync(new URL("../src/modules/RasterModule.jsx", import.meta.url), "utf8");
  assert.match(src, /disabled=\{same && k !== satLevel\}/);
  assert.match(src, /tr\("\{label\} resolution \(no finer here: the imagery's own pixels\)"/);
});
