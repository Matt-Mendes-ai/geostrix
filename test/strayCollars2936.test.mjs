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
  assert.equal(mainTraces(ts.slice(0, 10), (t) => t.z).length, 9, "#3004: the 0 m collar is suspect on a small project too (the gap test alone kept it)");
  const v = fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /const ts = mainTraces\(tracesRef\.current, \(t\) => t\.wz\?\.\[0\]\);/); // #3004 — world z (the 0 m test)
});

test("#3004 — the default ranges follow the shared collar rule: a 0 m collar on a small project is left out too (the gap test needs 20 holes)", async () => {
  const { mainTraces, levelPlanZRange } = await import("../src/lib/viewer/levelPlanRange.js");
  const tr = (id, z) => ({ hole_id: id, wz: [z, z - 50], pts: [{ y: z }] });
  const small = [tr("A", 440), tr("B", 452), tr("C", 461), tr("D", 0), tr("E", 447)];
  assert.deepEqual(mainTraces(small, (t) => t.wz[0]).map((t) => t.hole_id), ["A", "B", "C", "E"]);
  assert.deepEqual(levelPlanZRange(small, []), [390, 461], "the RL range from the trusted holes");
  const lowland = [tr("A", 5), tr("B", 12), tr("C", 0), tr("D", 8)];
  assert.equal(mainTraces(lowland, (t) => t.wz[0]).length, 4, "0 m beside collars near 0 is real");
  const assumed = [tr("A", 440), tr("B", 452), { ...tr("C", 0), zAssumed: true }, tr("D", 447)];
  assert.equal(mainTraces(assumed, (t) => t.wz[0]).length, 4, "an assumed elevation is said as assumed, not dropped here");
});
