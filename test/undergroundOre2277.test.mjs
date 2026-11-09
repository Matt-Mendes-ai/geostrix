// TASKS.csv #2277 (review #2174, WA lode gold) — the pit tools say how deep the ore lies below the highest collar, and call a deep or
// underground-drilled body an underground question
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { oreDepthBelowCollars, undergroundOreVerdict, DEEP_ORE_M, DEEP_ORE_UNDERGROUND_M } from "../src/lib/pitShell.js";

// blocks at 350 down to 80 m RL; ore (value >= 1) from 340 to 80
const cells = [];
for (let z = 350; z >= 80; z -= 10) cells.push({ x: 0, y: 0, z, dz: 10, value: z <= 340 ? 2 : 0.1 });

test("ore depth below the highest collar: min / median / max, the barren blocks left out", () => {
  const collars = [{ hole_id: "A", x: 0, y: 0, z: 390, dip: 60 }, { hole_id: "B", x: 900, y: 0, z: 370, dip: 60 }];
  const d = oreDepthBelowCollars(cells, 1, collars, []);
  assert.equal(d.top, 390);
  assert.equal(d.min, 50);
  assert.equal(d.max, 310);
  assert.equal(d.median, 180);
  assert.equal(d.underground, false);
  assert.equal(undergroundOreVerdict(d), false); // 180 m median from surface collars: no verdict
});

test("collars from underground: the lower threshold gives the verdict", () => {
  const ug = [];
  for (let i = 0; i < 6; i++) ug.push({ hole_id: `U${i}`, x: i, y: 0, z: 390 - i * 40, dip: i % 2 ? -30 : 60 }); // upholes, stacked collars
  const d = oreDepthBelowCollars(cells, 1, ug, ug.map((c) => ({ hole_id: c.hole_id, depth: 0, dip: c.dip })));
  assert.equal(d.underground, true);
  assert.ok(d.median >= DEEP_ORE_UNDERGROUND_M && d.median < DEEP_ORE_M);
  assert.equal(undergroundOreVerdict(d), true);
});

test("a deep body from surface collars gets the verdict; nothing to say without collars, a cut-off or ore", () => {
  const deep = cells.map((c) => ({ ...c, z: c.z - 300 }));
  assert.equal(undergroundOreVerdict(oreDepthBelowCollars(deep, 1, [{ hole_id: "A", x: 0, y: 0, z: 390, dip: 60 }], [])), true);
  assert.equal(oreDepthBelowCollars(cells, 1, [], []), null);
  assert.equal(oreDepthBelowCollars(cells, NaN, [{ z: 1 }], []), null);
  assert.equal(oreDepthBelowCollars(cells, 99, [{ z: 1 }], []), null);
  assert.equal(undergroundOreVerdict(null), false);
});

test("Pit shell, Nested pits and Pit design all show it", () => {
  const f = (n) => readFileSync(new URL(`../src/components/${n}.jsx`, import.meta.url), "utf8");
  assert.match(f("PitShellPane"), /<UndergroundOreNote model=\{model\} cutoff=\{res\.cutoff \?\? cutoff\} \/>/);
  assert.match(f("NestedPitsPane"), /<UndergroundOreNote model=\{model\} cutoff=\{lastPit\.params\?\.cutoffGrade\} \/>/);
  assert.match(f("PitDesignPane"), /<UndergroundOreNote model=\{model\} cutoff=\{pit\.params\?\.cutoffGrade\} \/>/);
});
