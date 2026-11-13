// TASKS.csv #2430 (review #2325, WA uranium) — the raw gamma log (439,780 readings, two channels ticked) was under the 1,000,000-value
// budget, so the default import kept 879,560 readings (3.7 s freeze, ~840 MB of heap). The budget is 200,000 values now, and the box says
// what every reading costs in memory.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LOG_RAW_BUDGET, needsBinning, defaultLogBin, effectiveLogBin, rawLogMB } from "../src/lib/downholeLogChannels.js";

test("the review's log: one or two channels of 439,780 readings default to 0.5 m bins", () => {
  assert.equal(LOG_RAW_BUDGET, 200_000);
  assert.equal(needsBinning(439_780, 1), true);
  assert.equal(defaultLogBin(439_780, 2), 0.5);
  assert.equal(effectiveLogBin({}, 439_780, 2), 0.5);
  // a short log stays reading by reading
  assert.equal(defaultLogBin(60_000, 3), null); // 180,000 values
  assert.equal(defaultLogBin(70_000, 3), 0.5); // 210,000 values
  // the user's own choice still wins
  assert.equal(effectiveLogBin({ logBinM: null }, 439_780, 2), null);
});

test("the memory estimate: about 1 KB a value, rounded to 10 MB, never below 10", () => {
  assert.equal(rawLogMB(439_780, 2), 880); // the review measured 98 -> 937 MB for these two channels
  assert.equal(rawLogMB(439_780, 1), 440);
  assert.equal(rawLogMB(100, 1), 10);
  assert.equal(rawLogMB(0, 0), 10);
});

test("the box states the estimate in both every-reading texts", () => {
  const b = readFileSync(new URL("../src/components/LogChannelsBox.jsx", import.meta.url), "utf8");
  assert.match(b, /every reading is chosen: about \{mb\} MB of memory, and the import may be slow/);
  assert.match(b, /tr\("Every reading is kept \(about \{mb\} MB of memory\)\. A bin averages them \(mean, with its minimum and maximum\)\.", \{ mb: rawLogMB\(readings, ticked\.length\)\.toLocaleString\(\) \}\)/);
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(new URL(`../src/locales/${lang}.json`, import.meta.url), "utf8"));
    assert.match(d["Every reading is kept (about {mb} MB of memory). A bin averages them (mean, with its minimum and maximum)."], /\{mb\}/, lang);
  }
});
