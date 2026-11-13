// TASKS.csv #2919 (review #2876, WA bedded iron) — the closed body's hand check multiplied the logged metres by the median hole spacing
// squared (22 m -> 484 m² a hole) where each hole of the block stands for about 1,140 m² (the holes' hull / their number): half the
// reviewer's figure. The check now uses the hull of the holes that log the unit, divided by every hole inside it.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { areaPerHole, loggedVolumeCheck } from "../src/lib/volumeCheck.js";

// a 15 x 15 pattern at 25 m by 50 m (the review's "25 x 50 m pattern halves it" case); the unit logged in the eastern two thirds
const all = [];
for (let i = 0; i < 15; i++) for (let j = 0; j < 15; j++) all.push({ x: i * 25, y: j * 50 });
const logged = all.filter((p) => p.x >= 125);

test("the area each hole stands for: the hull of the logging holes over every hole inside it", () => {
  const a = areaPerHole(logged, all);
  assert.equal(a.hullM2, 225 * 700); // 9 x 25 m wide, 14 x 50 m long
  assert.equal(a.holes, 150);
  assert.equal(a.m2, 1050);
  assert.ok(a.m2 > 25 * 25 * 1.6, "the nearest-hole spacing squared (625 m²) was well under it");
  assert.equal(areaPerHole([{ x: 0, y: 0 }, { x: 1, y: 1 }], all), null, "fewer than three holes: no hull");
});

test("the check uses it in place of the spacing squared, and the run says which", () => {
  const runs = [{ hole_id: "A", from: 0, to: 4 }, { hole_id: "B", from: 2, to: 5 }];
  assert.equal(loggedVolumeCheck(runs, 25).m3, 7 * 625);
  const hc = loggedVolumeCheck(runs, 25, { m2: 1050, holes: 150 });
  assert.equal(hc.m3, 7 * 1050); assert.equal(hc.areaM2, 1050); assert.equal(hc.hullHoles, 150);
  const r = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(r, /const aph = vol\.watertight && loggedBody \? areaPerHole\(/);
  assert.match(r, /loggedVolumeCheck\(codeRuns, auto\.spacing, aph\)/);
  for (const l of ["es", "pt", "fr", "ar"]) assert.ok(JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"))["A hand check on \"{label}\": {m} m of it logged in {n} hole(s), times the {a} m² each hole stands for (the hull of those holes, {h} holes inside it), is about {v} m³ (logged lengths, not true thicknesses). The envelope's {e} m³ follows its {cell} m cells and {r} m search."], l);
});
