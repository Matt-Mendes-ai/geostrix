// TASKS.csv #1030 (review #1016) — a stack unit missing between its neighbours pinches out: the contact between them is
// also given to the missing unit's top.
import test from "node:test";
import assert from "node:assert/strict";
import { pinchOutPoints } from "../src/lib/pinchOut.js";

// the review's case: 9 western holes A 900 / B 800 / C 700 m, 9 eastern holes A 900 / C 750 m and no B (vertical, collar 1000)
const rows = [], tops = { A: [], B: [], C: [] };
for (let i = 0; i < 18; i++) {
  const h = `H${i}`, east = i >= 9;
  const seq = east ? [["A", 100, 250], ["C", 250, 400]] : [["A", 100, 200], ["B", 200, 300], ["C", 300, 400]];
  rows.push({ hole_id: h, from: 0, to: 100, value: "OB" });
  for (const [u, from, to] of seq) { rows.push({ hole_id: h, from, to, value: u }); tops[u].push({ x: i * 50, y: 0, z: 1000 - from, hole_id: h, contactMd: from, srcCode: u }); }
}
const specs = ["A", "B", "C"].map((u) => ({ meshName: u, codes: [u], points: tops[u] }));

test("#1030 the A/C contact of the 9 holes without B also goes to B's top", () => {
  const r = pinchOutPoints(specs, rows);
  assert.deepEqual(r.absent, [{ unit: "B", holes: 9 }]);
  assert.equal(r.add[0].length, 0); assert.equal(r.add[2].length, 0);
  assert.equal(r.add[1].length, 9);
  assert.ok(r.add[1].every((p) => p.z === 750 && p.srcCode === "pinch:C" && !("contactMd" in p)));
});

test("#1030 nothing added when the unit is logged elsewhere in the hole, when the contact is not with a stack unit, or without depths", () => {
  // B logged deeper in the same hole (a repeat / fault): not absent
  const rep = [...rows, { hole_id: "H12", from: 400, to: 420, value: "B" }];
  assert.equal(pinchOutPoints(specs, rep).add[1].length, 8);
  // a dyke between A and C in one eastern hole: the row above C's top is not a stack unit
  const dyke = rows.map((r) => (r.hole_id === "H10" && r.value === "A" ? { ...r, to: 240 } : r)).concat([{ hole_id: "H10", from: 240, to: 250, value: "DYKE" }]);
  assert.equal(pinchOutPoints(specs, dyke).add[1].length, 8);
  // points with no contact depth (up-hole picks, drawn contacts): left alone
  const noMd = specs.map((s) => ({ ...s, points: s.points.map(({ contactMd: _c, ...p }) => p) }));
  assert.deepEqual(pinchOutPoints(noMd, rows).absent, []);
  // two units missing (A directly on D): both get the contact
  const four = ["A", "B", "C2", "C"].map((u) => ({ meshName: u, codes: [u], points: tops[u] || [] }));
  const r4 = pinchOutPoints(four, rows);
  assert.equal(r4.add[1].length, 9); assert.equal(r4.add[2].length, 18); // C2 is never logged: under every C top (on A in the east, on B in the west)
});
