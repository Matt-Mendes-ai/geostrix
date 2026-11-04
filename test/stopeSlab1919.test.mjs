// TASKS.csv #1919 — a blank From RL starts the slabs at the model's base, and a column is ore on a level only where its blocks
// fill at least half of it: a sliver of an ore block no longer makes a full-height stope
import test from "node:test";
import assert from "node:assert/strict";
import { stopeOutlines } from "../src/lib/stopeOutlines.js";

// 20 m cubes from z 998.69 (an estimate's lattice), one 2 x 2 column of ore (grade 3) in barren rock, four levels
function model() {
  const cells = [];
  for (let k = 0; k < 4; k++) for (let j = 0; j < 6; j++) for (let i = 0; i < 6; i++) {
    const ore = i >= 2 && i <= 3 && j >= 2 && j <= 3;
    cells.push({ x: 1000 + i * 20 + 10, y: 2000 + j * 20 + 10, z: 998.69 + k * 20 + 10, dx: 20, dy: 20, dz: 20, value: ore ? 3 : 0 });
  }
  return { name: "lattice", cells };
}

test("a blank From RL starts at the model's base, so a block-height interval puts one block in each slab", () => {
  const r = stopeOutlines(model(), { cutoff: 1, levelH: 20, density: 2.5 });
  assert.equal(r.from, 998.69);
  assert.equal(r.levels.length, 4);
  for (const l of r.levels) { assert.equal(l.stopes.length, 1); const s = l.stopes[0]; assert.ok(Math.abs(s.tonnes - 4 * 400 * 20 * 2.5) < 1e-6); assert.ok(Math.abs(s.volume - 4 * 400 * 20) < 1e-6, "the solid's volume is the slab's: no sliver"); }
});

test("a slab a sliver of an ore block overlaps is not a stope; one the block half fills is", () => {
  // From RL 998.39: the first slab (998.39-1018.39) is filled 19.7 of 20 m by the first block (ore); the slab 1018.39-1038.39 takes 0.3 m of it
  const sliver = stopeOutlines(model(), { cutoff: 1, levelH: 20, zMin: 1018.39, zMax: 1038.39, density: 2.5 });
  assert.equal(sliver.levels.length, 1);
  assert.equal(sliver.levels[0].stopes.length, 1, "the slab is 19.7 m of the SECOND block, which is ore: a stope");
  const thin = stopeOutlines(model(), { cutoff: 1, levelH: 20, zMin: 1038.69 + 9, zMax: 1038.69 + 29, density: 2.5 });
  // 1047.69-1067.69: 11 m of the third block (ore) and 9 m of the fourth (ore) — full cover, a stope
  assert.equal(thin.levels[0].stopes.length, 1);
  const top = stopeOutlines(model(), { cutoff: 1, levelH: 20, zMin: 1078.69 - 5, zMax: 1078.69 + 15, density: 2.5 });
  // 1073.69-1093.69: only 5 m of the top block lies in the slab (the model ends at 1078.69): a quarter — not a stope
  assert.equal(top.levels[0].stopes.length, 0, "a quarter-filled slab is not a stope");
  assert.equal(top.oreColumns, 0);
});
