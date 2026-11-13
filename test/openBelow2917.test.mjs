// TASKS.csv #2917 (review #2876, WA bedded iron) — after one Implicit surface, the unit under it was quoted as 'TNAM 26.8 Mm3': everything
// under the top of TNAM down to the box floor, about 35 times the TNAM in the holes. The run's lowest unit (under its last top, no base
// modelled) is now said as 'below Top of X, to the box floor at RL n', and lastLithBlock carries it (openBelow) for 'Add unit volumes'.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("the volumes line names the open lowest unit; the block carries it", () => {
  const r = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(r, /const lowestOpen = !baseRun && unitSpecs\.length \? \{ unit: unitSpecs\[unitSpecs\.length - 1\]\.meshName, top: unitSpecs\[unitSpecs\.length - 1\]\.label, floorRL:/);
  assert.match(r, /setLastLithBlock\(\{ \.\.\.\(lowestOpen \? \{ openBelow: lowestOpen \} : \{\}\)/);
  assert.match(r, /lowestOpen && v\.name === lowestOpen\.unit \? \(lowestOpen\.floorRL != null \? tr\("below \{top\}, to the box floor at RL \{rl\}: \{vol\}"/);
  for (const l of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"));
    assert.ok(d["below {top}, to the box floor at RL {rl}: {vol}"] && d["below {top}, to the box floor: {vol}"], l);
  }
});
