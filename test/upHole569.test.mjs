// TASKS.csv #569 — in a hole drilled upward the unit's TOP is at the interval's `to`, not its `from`.
import test from "node:test";
import assert from "node:assert/strict";
import { intervalEndIndex, intervalStartIndex, upperContactOf } from "../src/lib/viewer/intervals.js";
import { snapTargets } from "../src/lib/sectionDigitise.js";

// unit B logged in two rows (a logging split at 20 m) between A and C
const rows = (hole) => [
  { hole_id: hole, from: 0, to: 10, value: "A" },
  { hole_id: hole, from: 10, to: 20, value: "B" },
  { hole_id: hole, from: 20, to: 30, value: "B" },
  { hole_id: hole, from: 30, to: 40, value: "C" },
];
const UP = (md) => 100 + md * Math.sin(Math.PI / 6); // collar at 100 m, rising at +30 deg
const DOWN = (md) => 100 - md * Math.sin(Math.PI / 6);

const tops = (hole, zAt) => {
  const all = rows(hole);
  const ix = { startIndex: intervalStartIndex(all), endIndex: intervalEndIndex(all) };
  return all.filter((r) => r.value === "B").map((r) => upperContactOf(r, zAt, { ...ix, codes: new Set(["B"]) }));
};

test("#569 down-hole: B's top is at the first row's from (10 m); the 20 m split continues the unit", () => {
  const [r1, r2] = tops("D", DOWN);
  assert.deepEqual([r1.md, r1.upHole, r1.continues], [10, false, false]);
  assert.equal(r2.continues, true);
});

test("#569 up-hole (+30 deg): B's top is at the upper row's to (30 m, the higher end), not 10 m (its base)", () => {
  const [r1, r2] = tops("U", UP);
  assert.equal(r1.continues, true); // 10-20 continues into 20-30 above it
  assert.deepEqual([r2.md, r2.upHole, r2.continues], [30, true, false]);
  assert.ok(UP(30) > UP(10)); // the picked depth is the higher one
});

test("#569 no trace: the down-hole rule is kept", () => {
  const all = rows("N");
  const r = upperContactOf(all[1], null, { startIndex: intervalStartIndex(all), endIndex: intervalEndIndex(all), codes: new Set(["B"]) });
  assert.deepEqual([r.md, r.upHole], [10, false]);
});

test("#569 section snapping offers the same tops", () => {
  const trace = (zAt) => [0, 40].map((md) => ({ md, x: 0, y: md, z: zAt(md) }));
  const iv = (hole) => rows(hole).map((r) => ({ hole_id: hole, from: r.from, to: r.to, layer: "litho", label: `Lithology: ${r.value}` }));
  const t = snapTargets([...iv("U"), ...iv("D")], { unit: "B", kind: "contact", holes: [{ hole_id: "U", trace: trace(UP) }, { hole_id: "D", trace: trace(DOWN) }] });
  assert.deepEqual(t.map((x) => `${x.hole_id}@${x.md}`).sort(), ["D@10", "U@30"]);
  // without holes (old callers): from-based, as before
  assert.deepEqual(snapTargets(iv("U"), { unit: "B", kind: "contact" }).map((x) => x.md), [10]);
});
