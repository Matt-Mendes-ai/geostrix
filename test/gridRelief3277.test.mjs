// TASKS.csv #3277 (Galore review) — collars from RL 456 to 1,596 under a 2,000 m horizontal cell: the plane snapped to RL 0 and the walls ran
// from RL 0 to -2,000, below every hole. The vertical takes its own round step, the walls span the holes' elevations, and their level lines
// fall on round RLs. Synthetic collars, not Galore.
import test from "node:test";
import assert from "node:assert/strict";
import { verticalStep, gridPlacement, buildGridGroup, gridSnap } from "../src/lib/viewer/gridGroup.js";

// a cluster on a 1,100 m slope (RL 480 to 1,580) and a few holes out to 29 km: a 36 km grid of 2,000 m cells; holes 300 to 700 m long, 60° down (a positive dip)
const collars = [];
for (let i = 0; i < 40; i++) collars.push({ hole_id: `C${i}`, x: 350000 + (i % 8) * 250, y: 6334000 + Math.floor(i / 8) * 300, z: 480 + (i % 8) * 157, dip: 60, length: 300 + (i % 5) * 100 });
for (let i = 0; i < 4; i++) collars.push({ hole_id: `F${i}`, x: 360000 + i * 6000, y: 6330000 + i * 2000, z: 900, dip: 60, length: 200 });

test("the vertical step: the cell while the drilling spans two or more, else a round step, at most ten over the range", () => {
  assert.equal(verticalStep(50, 400), 50);
  assert.equal(verticalStep(2000, 1486), 200);
  assert.equal(verticalStep(2000, 0), 2000);
  assert.equal(verticalStep(1000, 600), 100);
});

test("the relief case: the plane near the drilling, the walls from the deepest hole to the highest collar, in 200 m steps", () => {
  const pl = gridPlacement(collars, []);
  assert.equal(pl.top, 1579);
  const g = buildGridGroup({ visible: true, mode: "3d", sizeAuto: true }, pl);
  const o = pl.origin, [ground, back, side] = g.children;
  const planeRL = o.z + ground.position.y;
  assert.equal(Math.abs(Math.round(planeRL) % 200), 0, `plane at RL ${planeRL}`);
  assert.ok(Math.abs(planeRL - o.z) <= 100, `plane at RL ${planeRL}, the mean collar ${o.z}`);
  const ys = back.geometry.attributes.position.array.filter((_, k) => k % 3 === 1), top = o.z + back.position.y + Math.max(...ys), bottom = o.z + back.position.y + Math.min(...ys);
  const deepest = Math.min(...collars.map((c) => c.z - c.length * Math.sin(Math.PI / 3)));
  assert.ok(top >= 1579 && top < 1579 + 200, `walls' top RL ${top}`);
  assert.ok(bottom <= deepest && bottom > deepest - 200, `walls' bottom RL ${bottom}, the deepest hole ${deepest}`);
  // every level line on a round RL (the vertical lines run the full height; level lines are the pairs at one y)
  const levels = new Set(ys.map((y) => Math.round(o.z + back.position.y + y)));
  for (const r of levels) assert.equal(Math.abs(r % 200), 0, `a level line at RL ${r}`);
  assert.equal(side.position.y, back.position.y);
});

test("a flat project keeps the cell for both, the plane on the cell and the walls hanging from it (#2369 unchanged)", () => {
  const o = { x: 577011, y: 6681766, z: 331.45 };
  assert.ok(Math.abs(o.z + gridSnap(o, 50).y - 350) < 1e-6);
  const g = buildGridGroup({ visible: true, mode: "3d", size: 1000, divisions: 20 }, { depth: 106, lift: 0, origin: o, top: 340 });
  assert.ok(Math.abs(o.z + g.children[0].position.y - 350) < 1e-6);
  const ys = g.children[1].geometry.attributes.position.array.filter((_, k) => k % 3 === 1);
  assert.ok(Math.abs(g.children[1].position.y + Math.max(...ys) - g.children[0].position.y) < 1e-6, "the walls start at the plane");
});
