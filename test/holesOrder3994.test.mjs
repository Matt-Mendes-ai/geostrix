// TASKS.csv #3994 — the stack's order from the holes as a plan: the fewest moves, units the holes never show together keep their place, contradictions listed and not forced, a unit seen in
// too few holes stays, a marked unconformity goes with its unit. Made-up logs (DH-23-xxx).
import test from "node:test";
import assert from "node:assert/strict";
import { holesOrderPlan, movesText } from "../src/lib/holesOrder.js";

// holes: [[unit, unit, ...]] each hole's units from the top down, 10 m each
const logs = (holes) => holes.flatMap((h, i) => h.map((value, k) => ({ hole_id: `DH-23-${String(i).padStart(3, "0")}`, from: k * 10, to: k * 10 + 10, value })));
const many = (n, units) => Array.from({ length: n }, () => units);

test("#3994 a clean order: the holes give D, A, B, C; one unit logged above the rest moves up, the others shift down by one and keep their order", () => {
  const rows = logs(many(7, ["D", "A", "B", "C"]));
  const p = holesOrderPlan(rows, ["A", "B", "C", "D"]);
  assert.deepEqual(p.order, ["D", "A", "B", "C"]);
  assert.deepEqual(p.moves.map((m) => [m.unit, m.by]), [["D", 3], ["A", -1], ["B", -1], ["C", -1]]);
  assert.equal(p.same, false); assert.deepEqual(p.contradictions, []);
  assert.deepEqual(movesText(p), ["D up 3", "A down 1", "B down 1", "C down 1"]);
  assert.deepEqual(movesText(p, (u) => u.toLowerCase(), { max: 2, more: (n) => `+${n}` }), ["d up 3", "a down 1", "+2"]);
  // already right: nothing moves
  const ok = holesOrderPlan(rows, ["D", "A", "B", "C"]);
  assert.equal(ok.same, true); assert.deepEqual(ok.moves, []); assert.deepEqual(ok.order, ["D", "A", "B", "C"]);
});

test("#3994 units the holes never show together keep their relative place; units with no logs at all stay where they are", () => {
  // X and Y are logged in different holes: never together. The stack lists X, A, Y, B; the holes only say B is above A.
  const rows = logs([...many(4, ["B", "A", "X"]), ...many(4, ["B", "A", "Y"])]);
  const p = holesOrderPlan(rows, ["X", "A", "Y", "B"]);
  // X and Y are both under A and B in the holes: X stays above Y (their given order), B is pulled up in front of A
  assert.ok(p.order.indexOf("B") < p.order.indexOf("A"));
  assert.ok(p.order.indexOf("X") < p.order.indexOf("Y"), "X and Y were never seen together: their relative place is kept");
  const lone = holesOrderPlan(logs(many(5, ["B", "A"])), ["A", "Z", "B"]); // Z is in no log
  assert.deepEqual(lone.order, ["B", "A", "Z"], "the stack order changes only as the holes need; Z has no log and is not shuffled past a unit it is unrelated to");
  assert.ok(lone.kept.includes("Z"));
  const nothing = holesOrderPlan([], ["A", "B", "C"]);
  assert.equal(nothing.same, true); assert.deepEqual(nothing.kept, ["A", "B", "C"]); assert.equal(nothing.placed, 0);
});

test("#3994 a contradiction is listed and not forced: A above B in some holes and B above A in others stays as the user set it", () => {
  const rows = logs([...many(4, ["A", "B"]), ...many(4, ["B", "A"])]); // 4 against 4: neither reaches two thirds
  const p = holesOrderPlan(rows, ["B", "A"]);
  assert.deepEqual(p.order, ["B", "A"]); assert.equal(p.same, true);
  assert.equal(p.contradictions.length, 1);
  assert.deepEqual(p.contradictions[0], { kind: "split", units: ["B", "A"], aAbove: 4, bAbove: 4, of: 8 });
  // a clear majority is not a contradiction: 6 of 8 holes put A above B
  const clear = holesOrderPlan(logs([...many(6, ["A", "B"]), ...many(2, ["B", "A"])]), ["B", "A"]);
  assert.deepEqual(clear.order, ["A", "B"]); assert.deepEqual(clear.contradictions, []);
});

test("#3994 a loop (A over B, B over C, C over A, each clear on its own) is listed, the closing edge dropped, and the rest is still sorted", () => {
  const rows = logs([...many(4, ["A", "B"]), ...many(4, ["B", "C"]), ...many(4, ["C", "A"])]);
  const p = holesOrderPlan(rows, ["C", "B", "A", "D"]);
  assert.equal(p.contradictions.filter((c) => c.kind === "loop").length, 1);
  const loop = p.contradictions.find((c) => c.kind === "loop");
  assert.deepEqual([...new Set(loop.units)].sort(), ["A", "B", "C"]);
  assert.equal(p.order.length, 4); assert.deepEqual([...p.order].sort(), ["A", "B", "C", "D"], "every unit is still in the list, once");
  assert.equal(p.order[3], "D", "an unrelated unit keeps its place at the end");
});

test("#3994 a unit seen with others in fewer than three holes stays where it is (too little to move it on)", () => {
  const rows = logs([...many(5, ["A", "B"]), ["Q", "A"], ["Q", "B"]]); // Q is logged above both, in 2 holes only
  const p = holesOrderPlan(rows, ["A", "B", "Q"]);
  assert.deepEqual(p.order, ["A", "B", "Q"]); assert.ok(p.kept.includes("Q")); assert.equal(p.minHoles, 3);
  const three = holesOrderPlan(logs([...many(5, ["A", "B"]), ["Q", "A"], ["Q", "A"], ["Q", "A"]]), ["A", "B", "Q"]);
  assert.equal(three.order[0], "Q", "in three holes that log it with A it is above A");
});

test("#3994 a marked unconformity goes with its unit: the stack keeps breaks by unit key, so any order that moves the unit moves its mark (the plan only reorders keys)", () => {
  const p = holesOrderPlan(logs(many(6, ["D", "A", "B", "C"])), ["A", "B", "C", "D"]);
  const breaks = ["C"]; // an unconformity marked above C
  const above = (order, unit) => order[order.indexOf(unit) - 1];
  assert.equal(above(["A", "B", "C", "D"], "C"), "B"); assert.equal(above(p.order, "C"), "B", "above C is still B: C and its mark moved together");
  assert.deepEqual(breaks.filter((u) => p.order.includes(u)), breaks);
});

test("#3994 the codes of a group or a modelling code are read through codesOf; many units (25) sort in one pass", () => {
  const rows = logs(many(5, ["G1", "G2", "r1", "r2"]));
  const p = holesOrderPlan(rows, ["group:b", "group:a"], (u) => (u === "group:a" ? ["G1", "G2"] : ["r1", "r2"]));
  assert.deepEqual(p.order, ["group:a", "group:b"]);
  const names = Array.from({ length: 25 }, (_, i) => `U${i}`), shuffled = [...names].reverse();
  const big = holesOrderPlan(logs(many(8, names)), shuffled);
  assert.deepEqual(big.order, names); assert.equal(big.moves.length > 0, true); assert.deepEqual(big.contradictions, []);
});
