// TASKS.csv #2530 (review #2486, WA lithium) — envelope volumes to two significant figures, a hand check beside them, and one automatic
// search rule for a logged code whichever tool builds its envelope
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { roundVolume, loggedVolumeCheck } from "../src/lib/volumeCheck.js";

test("two significant figures", () => {
  assert.equal(roundVolume(528073), 530000);
  assert.equal(roundVolume(4851143), 4900000);
  assert.equal(roundVolume(300007), 300000);
  assert.equal(roundVolume(87.4), 87);
  assert.equal(roundVolume(0), 0);
  assert.equal(roundVolume(NaN), 0);
});

test("the hand check: logged length times the spacing squared", () => {
  const runs = [{ hole_id: "A", from: 10, to: 16 }, { hole_id: "A", from: 30, to: 34 }, { hole_id: "B", from: 5, to: 15 }];
  assert.deepEqual(loggedVolumeCheck(runs, 25), { metres: 20, holes: 2, spacingM: 25, m3: 12500 });
  assert.equal(loggedVolumeCheck(runs, 0), null);
  assert.equal(loggedVolumeCheck([], 25), null);
});

test("the Lithology / Weathering envelope takes Closed body's automatic rule; the notices round and check", () => {
  const m = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(m, /const loggedBody = isCode \|\| sourceKey === "litho" \|\| sourceKey === "weath";/);
  assert.match(m, /const autoB = loggedBody \? autoBodyParams\(/);
  assert.match(m, /closed \(about \{volumeM3\} m³\)", \{ volumeM3: roundVolume\(vol\.volumeM3\)/);
  assert.match(m, /loggedVolumeCheck\(codeRuns, auto\.spacing(, aph)?\)/); // aph (the area each hole stands for): #2919
});
