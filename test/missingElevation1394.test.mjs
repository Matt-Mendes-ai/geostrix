// TASKS.csv #1394 — a surface sample's elevation of 0: missing among highland elevations, real on a coast
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { zeroMeansMissing } from "../src/lib/missingElevation.js";
import { silvertipSurface } from "../src/lib/sampleSilvertip.js";

test("0 among elevations of 1,000+ m is missing; on a coast it is real; all-zero is missing (#606)", () => {
  assert.equal(zeroMeansMissing([1400, 0, 1520, null, 1610]), true);
  assert.equal(zeroMeansMissing([0, 3, 12, 8, 0, 25]), false);
  assert.equal(zeroMeansMissing([0, 0, NaN, 0]), true);
  assert.equal(zeroMeansMissing([1400, 1500]), false);
  assert.equal(zeroMeansMissing([]), false);
});

test("Silvertip's three surface files: the 57 zero elevations are the only ones caught", () => {
  const all = ["rocks", "soils", "streams"].flatMap((f) => silvertipSurface(readFileSync(`sample_data/silvertip/${f}.csv`, "utf8"), f).samples);
  const zeros = all.filter((s) => s.z === 0).length;
  assert.equal(zeros, 57);
  assert.equal(zeroMeansMissing(all.map((s) => s.z)), true);
});
