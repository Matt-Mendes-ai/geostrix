// TASKS.csv #2528 (review #2486, WA lithium) — the model box's vertical pad comes from the drilled column under the model's own footprint,
// not from every hole in the project
import test from "node:test";
import assert from "node:assert/strict";
import { drilledColumn, verticalPad } from "../src/lib/contactReach.js";

// bench holes 15-20 m deep around RL 300-320 in the box; one 577 m diamond hole elsewhere, collar 329.9, toe -261.7
const bench = Array.from({ length: 40 }, (_, i) => [{ x: 413600 + i * 5, y: 6253200, z: 320 }, { x: 413600 + i * 5, y: 6253200, z: 302 }]).flat();
const deep = [{ x: 410000, y: 6250000, z: 329.9 }, { x: 410050, y: 6250000, z: -261.7 }];
const box = { xmin: 413500, xmax: 414000, ymin: 6253000, ymax: 6253500 };

test("the column is the drilling inside the box; the far deep hole does not count", () => {
  const col = drilledColumn([...bench, ...deep], box);
  assert.deepEqual(col, { min: 302, max: 320 });
  const pad = verticalPad(10, col.max - col.min, 500);
  assert.equal(pad, 20); // the floor: 0.5 x 18 m is under 20 m
  const whole = verticalPad(10, 329.9 - -261.7, 500); // #2377 as it was: the project's column
  assert.ok(Math.abs(whole - 295.8) < 1e-9); // the review's 295.8 m of pad, a box of RL -557.5 to 625.7
});

test("no trace inside the box: null (the run then keeps the contacts' own range)", () => {
  assert.equal(drilledColumn(deep, box), null);
  assert.equal(drilledColumn([], box), null);
});
