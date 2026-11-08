// TASKS.csv #2048 (review #2013, 3D Modelling) — Structures solved 47 random stockwork picks as ONE surface (15 s) with no question first,
// and called veinlets 0.22 m apart 'repeated at the same spot'.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pickReport } from "../src/lib/pickDiagnostics.js";
const r = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");

const pt = (hole, depth, z) => ({ x: 0, y: 0, z, hole_id: hole, depth });
test("two picks 0.22 m apart down a hole are 'close', a repeated row is a duplicate", () => {
  const rep = pickReport({ label: "S", points: [pt("DH24-120", 237.85, -237.85), pt("DH24-120", 238.07, -238.07), pt("DH24-120", 300, -300), pt("DH24-120", 300, -300)], orientations: [] });
  assert.equal(rep.close, 1);
  assert.equal(rep.duplicates, 1);
  assert.deepEqual(rep.closeExamples, ["DH24-120 at 237.85 / 238.07 m"]);
});
test("the Structures run asks before the solve when picks are random or many per hole, and stops on No", () => {
  const gate = r.indexOf("const setLike = [...byId].map(");
  const solve = r.indexOf("await runSurfaceModel({ label: `Structure: ${name}`");
  assert.ok(gate > 0 && solve > gate);
  const block = r.slice(gate, solve);
  assert.match(block, /fs\?\.noPreferred \? tr\("no preferred orientation \(k = \{k\}\)"/);
  assert.match(block, /group\.length >= 4 && perHole > 2\.5 \? tr\("\{n\} picks per hole"/);
  assert.match(block, /if \(setLike\.length && !window\.confirm\(tr\("\{list\}: these picks behave like a vein set or a fabric, not one surface\./);
  assert.match(block, /Stereonet > Add as structural trend[\s\S]*return;/);
});
test("the pick check says closely spaced picks apart from repeats", () => {
  assert.match(r, /r\.close \? tr\(" \{n\} pair\(s\) of picks less than 0\.5 m apart down the hole/);
});
