// TASKS.csv #3131 (#3023, WA iron review) — the strip log says when the collar RL is not a surveyed one, with #3004's rule (as the Layout
// collar table marks it): filled at import (zAssumed), or in the file but probably a missing value (suspect).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { stripLogFurniture } from "../src/lib/figureFurniture.js";
import { suspectIdsOf } from "../src/lib/collarTable.js";
import { elevationTrust } from "../src/lib/collarElevationTrust.js";

test("the exported caption carries the note after the RL; without one it reads as before", () => {
  const collar = { x: 806425, y: 7507025, z: 438.8 };
  const plain = stripLogFurniture({ holeId: "H1", collar, maxDepth: 28, pxPerMeter: 6 });
  assert.match(plain.caption[0], /RL 438\.8(,|$| ·)/);
  const noted = stripLogFurniture({ holeId: "H1", collar, rlNote: "filled at import, not in the collar file", maxDepth: 28, pxPerMeter: 6 });
  assert.match(noted.caption[0], /RL 438\.8 \(filled at import, not in the collar file\)/);
});

test("the rule the window reads: assumed from the import's flag; suspect from the collars around it", () => {
  const collars = Array.from({ length: 20 }, (_, i) => ({ hole_id: `H${i}`, x: i * 25, y: 0, z: 430 + (i % 7) }));
  collars.push({ hole_id: "FILLED", x: 600, y: 0, z: 433, zAssumed: "median" }, { hole_id: "ZERO", x: 625, y: 0, z: 0 });
  const s = suspectIdsOf(collars);
  assert.equal(elevationTrust(collars[0], s), "measured");
  assert.equal(elevationTrust(collars[20], s), "assumed");
  assert.equal(elevationTrust(collars[21], s), "suspect");
});

test("wiring: StripLog computes the note with the cached rule and puts it in the header and the furniture", () => {
  const src = fs.readFileSync(new URL("../src/components/StripLog.jsx", import.meta.url), "utf8");
  assert.match(src, /const rlTrust = collar \? elevationTrust\(collar, suspectIdsOf\(collars\)\) : "measured";/);
  assert.match(src, /stripLogFurniture\(\{ holeId, collar, fromDepth: d0, maxDepth: d1, rlNote \/\* #3131 \*\/,/);
  assert.match(src, /tr\("collar RL \{rl\} m: \{note\}", \{ rl: Number\(collar\.z\)\.toFixed\(1\), note: rlNote \}\)/);
});
