// TASKS.csv #823 — drillhole labels on a section: no two overlap, a pad of holes fans out with leaders, labels can go
// below the end of the hole, a dragged label stays where it was put and the others avoid it
import test from "node:test";
import assert from "node:assert/strict";
import { placeLabels, leaderEnd, labelWidth } from "../src/lib/sectionLabels.js";

const clash = (a, b) => a.x - a.w / 2 < b.x + b.w / 2 && b.x - b.w / 2 < a.x + a.w / 2 && a.y - a.h < b.y && b.y - b.h < a.y;
const noClash = (L) => { for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) assert.ok(!clash(L[i], L[j]), `${L[i].key} / ${L[j].key}`); };

test("#823 eight holes from one pad: no overlap, labels above the collar, leaders for the displaced ones", () => {
  const items = Array.from({ length: 8 }, (_, i) => ({ key: `PS-26-${String(i + 1).padStart(2, "0")}`, text: `PS-26-${String(i + 1).padStart(2, "0")}`, ax: 400 + i * 1.5, ay: 200, dir: -1 }));
  const L = placeLabels(items, { fontSize: 9, bounds: [60, 1040] });
  assert.equal(L.length, 8);
  noClash(L);
  for (const b of L) assert.ok(b.y < 200, "above the collar");
  assert.ok(L.filter((b) => b.leader).length >= 6, "most of a pad's labels are called out");
  assert.ok(L.filter((b) => !b.leader).length >= 1, "the first one sits in its natural place");
  const spanY = Math.max(...L.map((b) => b.y)) - Math.min(...L.map((b) => b.y));
  assert.ok(spanY < 6 * 11, `stacked only a few tiers deep (${spanY})`); // fanned sideways too, not one tall column
});

test("#823 holes well apart keep their natural spot; end-of-hole labels go below; bounds respected", () => {
  const items = [0, 1, 2].map((i) => ({ key: `H${i}`, text: `HOLE-${i}`, ax: 100 + i * 200, ay: 300, dir: 1 }));
  const L = placeLabels(items, { fontSize: 10, bounds: [60, 1040] });
  for (const b of L) { assert.equal(b.leader, false); assert.ok(b.y > 300); assert.equal(b.x, b.ax); }
  const edge = placeLabels([{ key: "E", text: "LONG-HOLE-NAME-01", ax: 61, ay: 100, dir: -1 }], { fontSize: 9, bounds: [60, 1040] })[0];
  assert.ok(edge.x - edge.w / 2 >= 60, "kept inside the plot");
});

test("#823 a dragged label stays put; the automatic ones avoid it", () => {
  const items = [{ key: "A", text: "AAAA-01", ax: 500, ay: 200, dir: -1 }, { key: "B", text: "BBBB-02", ax: 502, ay: 200, dir: -1 }];
  const free = placeLabels(items, { fontSize: 9 });
  const bNatural = free.find((b) => b.key === "A"); // A is placed first (leftmost) at its natural spot
  const L = placeLabels(items, { fontSize: 9, fixed: { B: { dx: bNatural.x - 502, dy: bNatural.y - 200 } } }); // B dragged onto A's spot
  const b = L.find((x) => x.key === "B"), a = L.find((x) => x.key === "A");
  assert.ok(b.moved && Math.abs(b.x - bNatural.x) < 1e-9 && Math.abs(b.y - bNatural.y) < 1e-9);
  noClash(L);
  assert.ok(a.leader, "A moved out of the way and is called out");
});

test("#823 leader ends on the label edge facing the anchor", () => {
  const b = { x: 100, y: 50, w: labelWidth("X-1", 9), h: 11, ax: 100, ay: 80 };
  assert.deepEqual(leaderEnd(b), [100, 52]);
  assert.deepEqual(leaderEnd({ ...b, ay: 10 }), [100, 40]);
});

test("#823 a label pushed in from an anchor past the edge is called out", () => {
  const [b] = placeLabels([{ key: "E", text: "17HR-283 · EOH 158 m", ax: 1090, ay: 400, dir: 1 }], { fontSize: 9, bounds: [4, 1096] });
  assert.ok(b.x + b.w / 2 <= 1096 && b.leader);
});
