// TASKS.csv #3004 (the shared rule) / #2896 (review #2876, WA bedded iron) — two collars at Elevation 0.0 among collars at 396-471 m were
// placed at sea level with no word. One rule marks each collar's elevation as measured, assumed (#2169) or suspect; the import stores it
// and says it, Data QC flags it.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { suspectElevationIds, markSuspectElevations, elevationTrust } from "../src/lib/collarElevationTrust.js";

const plateau = Array.from({ length: 40 }, (_, i) => ({ hole_id: `RC${i}`, z: 396.7 + (i * 74.7) / 39 }));
const wa = [...plateau, { hole_id: "RHRCMET_0154_A", z: 0 }, { hole_id: "RHRCMET_0155_A", z: 0 }, { hole_id: "RC_blank", z: 439, zAssumed: "median" }];

test("0 m on a 440 m plateau is suspect; assumed elevations are not judged", () => {
  assert.deepEqual([...suspectElevationIds(wa)].sort(), ["RHRCMET_0154_A", "RHRCMET_0155_A"]);
  const m = markSuspectElevations(wa);
  assert.deepEqual(m.ids.sort(), ["RHRCMET_0154_A", "RHRCMET_0155_A"]);
  assert.equal(m.collars.find((c) => c.hole_id === "RHRCMET_0154_A").zSuspect, true);
  assert.equal(m.collars.find((c) => c.hole_id === "RC3").zSuspect, undefined);
  assert.equal(m.collars.find((c) => c.hole_id === "RC3"), wa.find((c) => c.hole_id === "RC3"), "unchanged collars are the same objects");
  assert.deepEqual(m.range.map(Math.round), [397, 471]);
  assert.equal(elevationTrust(m.collars.find((c) => c.hole_id === "RHRCMET_0155_A")), "suspect");
  assert.equal(elevationTrust(m.collars.find((c) => c.hole_id === "RC_blank")), "assumed");
  assert.equal(elevationTrust(m.collars.find((c) => c.hole_id === "RC0")), "measured");
});

test("0 m near sea level is an elevation; a fixed file clears the mark; a stray far from all is suspect", () => {
  const coast = [...Array.from({ length: 30 }, (_, i) => ({ hole_id: `C${i}`, z: 2 + (i % 9) })), { hole_id: "C0m", z: 0 }];
  assert.equal(suspectElevationIds(coast).size, 0);
  const fixed = markSuspectElevations([...plateau, { hole_id: "RHRCMET_0154_A", z: 440, zSuspect: true }]);
  assert.equal(fixed.ids.length, 0);
  assert.equal(fixed.collars.find((c) => c.hole_id === "RHRCMET_0154_A").zSuspect, undefined, "re-imported with an RL: no longer suspect");
  const field = Array.from({ length: 300 }, (_, i) => ({ hole_id: `F${i}`, z: 396.7 + (i % 75) })); // the #2936 test caps strays at 1 % of the holes
  assert.deepEqual([...suspectElevationIds([...field, { hole_id: "TYPO", z: 4400 }])], ["TYPO"], "the #2936 gap test, one rule");
  assert.equal(suspectElevationIds([{ hole_id: "A", z: 0 }, { hole_id: "B", z: 500 }]).size, 0, "too few collars to judge");
});

test("the import stores and says it; Data QC flags it", () => {
  const u = readFileSync(new URL("../src/modules/viewer/importPipelineImpl.js", import.meta.url), "utf8");
  assert.match(u, /setCollars\(\(prev\) => markSuspectElevations\(Array\.from\(new Map\(\[\.\.\.prev, \.\.\.applied\]\.map\(\(c\) => \[c\.hole_id, c\]\)\)\.values\(\)\)\)\.collars\);/);
  assert.match(u, /if \(suspectHere\.length\) \{ \/\/ #2896/);
  const q = readFileSync(new URL("../src/lib/dataQC.js", import.meta.url), "utf8");
  assert.match(q, /const sus = suspectElevationIds\(collars\);/);
  for (const l of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"));
    for (const k of ["Elevation {z} m in the collar file, far from the other collars ({lo}–{hi} m): probably a missing value. Everything on the hole sits at that height; check the collar RL and re-import the collars.", "{n} collar elevation(s) look like a missing value, far from the other collars ({lo}–{hi} m): {list}. They are placed as the file says, marked as suspect, and flagged in Data QC"]) assert.ok(d[k], `${l}: ${k}`);
  }
});
