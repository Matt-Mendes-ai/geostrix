// TASKS.csv #1100 (review #1016) — the grade shell's mean grade leaves out the nodes the topography cap removed.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { capFieldAtGround } from "../src/lib/groundCap.js";

test("#1100 the mean is taken over nodes inside the shell after the cap", () => {
  const src = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(src, /gv >= numericCutoff && capV\[i\] >= numericCutoff/);
  // a 1 x 1 x 4 column, ground at z = 15: the two upper nodes (20, 30) are in the air and are capped below the cutoff
  const v = Float32Array.from([2, 2, 5, 5]), cut = 1;
  const { values } = capFieldAtGround(v, 1, 1, 4, { x: 0, y: 0, z: 0 }, { dx: 10, dy: 10, dz: 10 }, cut, () => 15);
  let s = 0, n = 0;
  for (let i = 0; i < v.length; i++) if (v[i] >= cut && values[i] >= cut) { s += v[i]; n++; }
  assert.equal(n, 2); assert.equal(s / n, 2); // was (2 + 2 + 5 + 5) / 4 = 3.5 with the air included
});
