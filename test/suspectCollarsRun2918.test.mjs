// TASKS.csv #2918 (review #2876, WA bedded iron) — two collars at elevation 0 on a 440 m plateau made the whole-field model box 1,063 m
// tall (cells of 212 m), and nothing named them before the run. Every implicit / stack run (runSurfaceStack) now leaves the holes whose
// collar elevation is suspect (#3004's rule) out of its contacts, its drilled column, its extent and its model check, and names them.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { suspectElevationIds } from "../src/lib/collarElevationTrust.js";

test("the WA iron shape: the two 0 m collars are the suspect ones", () => {
  const collars = [...Array.from({ length: 50 }, (_, i) => ({ hole_id: `RC${i}`, z: 417 + i })), { hole_id: "RHRCMET_0154_A", z: 0 }, { hole_id: "RHRCMET_0155_A", z: 0 }];
  assert.deepEqual([...suspectElevationIds(collars)].sort(), ["RHRCMET_0154_A", "RHRCMET_0155_A"]);
});

test("runSurfaceStack leaves them out of the contacts, the drilled column, the extent and the check, and says so", () => {
  const r = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(r, /const suspectZ = suspectElevationIds\(collars \|\| \[\]\);/);
  assert.match(r, /s\.points = s\.points\.filter\(\(p\) => !\(p\.hole_id != null && suspectZ\.has\(p\.hole_id\)\)\)/);
  assert.match(r, /\.map\(\(p\) => \(\{ \.\.\.p, hole: t\.hole_id \}\)\)\)\.filter\(\(p\) => !suspectZ\.has\(p\.hole\) \/\* #2918 \*\/\) : allApiPts;/);
  assert.match(r, /const allApiPts = traces\.filter\(\(t\) => !suspectZ\.has\(t\.hole_id\) \/\* #2918 \*\/\)/);
  assert.match(r, /if \(suspectZ\.has\(t\.hole_id\)\) return; \/\/ TASKS\.csv #2918/);
  for (const l of ["es", "pt", "fr", "ar"]) assert.ok(JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"))["Left out of this run: {n} hole(s) whose collar elevation looks like a missing value ({list}), with {k} contact(s) on them. Their contacts would sit at that elevation and stretch the model box; fix the collar RL and re-import the collars to use them."], l);
});
