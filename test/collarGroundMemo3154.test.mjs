// TASKS.csv #3154 — before an Implicit run on the 268-hole WA iron block the window stopped 2.2-2.4 s. Measured again (2026-11-14) it is two
// tasks of about 150 and 210 ms: the 2.2-2.4 s included the CPU profiler's own start (about 1.1 s) and work later rows removed. Of what is left,
// the collar surface (the bench check and the k-d tree over 6,292 collars, about 60 ms) was rebuilt on every run: it is now kept per collars
// array and survey.
import test from "node:test";
import assert from "node:assert/strict";
import { modelGround } from "../src/lib/modelGround.js";

const grid = () => { const out = []; for (let i = 0; i < 20; i++) for (let j = 0; j < 20; j++) out.push({ hole_id: `H${i}_${j}`, x: i * 50, y: j * 50, z: 300 + i - j }); return out; };

test("the collar surface is kept per collars array and survey; a new array or survey recomputes it", () => {
  const collars = grid(), survey = [];
  const a = modelGround(null, collars, survey), b = modelGround(null, collars, survey);
  assert.equal(a.kind, "collars");
  assert.equal(a, b, "the same object for the same collars and survey");
  assert.notEqual(modelGround(null, collars, []), a, "another survey array: recomputed");
  const c = modelGround(null, grid(), survey);
  assert.notEqual(c, a); assert.equal(c.ground.at(125, 125), a.ground.at(125, 125), "the same answer from a new array");
  // without a survey: one shared default, so the memo holds
  const collars2 = grid();
  assert.equal(modelGround(null, collars2), modelGround(null, collars2));
  // the ground itself is unchanged by the memo: an IDW of the four nearest collars
  assert.ok(Math.abs(a.ground.at(0, 0) - 300) < 1e-9);
});

test("a terrain or too few collars: not kept, as before", () => {
  const terrain = { name: "t", bbox: [0, 0, 10, 10] };
  const t1 = modelGround(terrain, grid()), t2 = modelGround(terrain, grid());
  assert.equal(t1.kind, "terrain"); assert.notEqual(t1, t2);
  assert.deepEqual(modelGround(null, [{ x: 0, y: 0, z: 1 }]), { ground: null, why: "few" });
});
