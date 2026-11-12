// TASKS.csv #2936 (WA iron review) — two collars at z = 0 among thousands at 397-471 m set the Level plan's RL range (-60 to 472 m) and the
// horizontal 3D slice's start (181-231 m). A small group cut off by a wide elevation gap is left out of those default ranges.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { strayCollars, mainTraces, levelPlanZRange } from "../src/lib/viewer/levelPlanRange.js";

let seed = 3; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

test("WA iron: the two z = 0 collars are stray; the Level plan range is the drilling's", () => {
  const zs = Array.from({ length: 6388 }, () => 397 + rnd() * 74);
  zs.splice(100, 0, 0); zs.splice(4000, 0, 0);
  const drop = strayCollars(zs);
  assert.deepEqual([...drop].sort((a, b) => a - b), [100, 4000]);
  const traces = zs.map((z) => ({ wz: [z, z - 25, z - 50] }));
  const [z0, z1] = levelPlanZRange(traces, []);
  assert.ok(z0 > 340 && z1 <= 471.1, `${z0} .. ${z1}`);
});

test("continuous relief, a large second group or a small project: nothing dropped", () => {
  assert.equal(strayCollars(Array.from({ length: 500 }, (_, i) => 200 + i * 2)).size, 0, "a mountain: 200-1,198 m, no gap");
  const two = [...Array.from({ length: 300 }, () => 400 + rnd() * 20), ...Array.from({ length: 50 }, () => rnd() * 20)];
  assert.equal(strayCollars(two).size, 0, "50 of 350 holes is a real second area, not a stray");
  assert.equal(strayCollars([0, 400, 401, 402, 403]).size, 0, "under 20 holes: left as is");
  assert.equal(strayCollars([]).size, 0);
});

test("mainTraces keeps the order and drops only the strays; the 3D slice's extent uses it", () => {
  const ts = Array.from({ length: 300 }, (_, i) => ({ id: i, z: 400 + (i % 30) }));
  ts[7].z = 0;
  const kept = mainTraces(ts, (t) => t.z);
  assert.equal(kept.length, 299);
  assert.ok(!kept.some((t) => t.id === 7));
  assert.equal(mainTraces(ts.slice(0, 10), (t) => t.z).length, 10);
  const v = fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /const ts = mainTraces\(tracesRef\.current, \(t\) => t\.pts\?\.\[0\]\?\.y\);/);
});
