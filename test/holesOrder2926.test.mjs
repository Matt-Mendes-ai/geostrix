// TASKS.csv #2926 (review #2876, WA bedded iron) — the pile's order was known to the app but had to be typed: the stack's check (#2382)
// gave the holes' order after Run and said 'Reorder the units with the arrows', the unit picker was sorted by interval count, and Modelling
// codes listed 34 codes alphabetically under 'youngest at the top'. Now the holes' order is one click away in both lists, the stack is
// checked as units are added, and the picker follows the holes.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { orderFromHoles, movesToOrder } from "../src/lib/pileTops.js";

// the review's six strands, logged HNAM, TNAM, ONAM, SONAM, SNAM, BNAM down every hole; typed in the order of mean depth over the field
const U = ["HNAM", "TNAM", "ONAM", "SONAM", "SNAM", "BNAM"];
const rows = [];
for (let h = 0; h < 6; h++) U.forEach((u, k) => rows.push({ hole_id: `H${h}`, from: 4 * k + (h % 2), value: u }));
rows.push({ hole_id: "H9", from: 0, value: "DYKE" }); // a code the others never meet

test("the holes' order for any list, with the pairs the given order has the other way up", () => {
  const typed = ["ONAM", "TNAM", "HNAM", "SONAM", "SNAM", "BNAM"];
  const r = orderFromHoles(rows, typed);
  assert.deepEqual(r.order, U);
  assert.equal(r.placed, 6);
  assert.deepEqual(r.conflicts.map((q) => [typed[q.younger], typed[q.older]]).sort(), [["ONAM", "HNAM"], ["ONAM", "TNAM"], ["TNAM", "HNAM"]].sort());
  assert.equal(orderFromHoles(rows, U).conflicts.length, 0, "already in order");
  const g = orderFromHoles(rows, ["lower", "upper"], (u) => (u === "upper" ? ["HNAM", "TNAM"] : ["SNAM", "BNAM"]));
  assert.deepEqual(g.order, ["upper", "lower"], "groups: a unit is its logged codes");
  const lone = orderFromHoles(rows, ["DYKE", "HNAM"]);
  assert.equal(lone.placed, 0, "never logged together: not placed");
  assert.deepEqual(lone.order, ["DYKE", "HNAM"], "kept as given");
});

test("the moves that turn the list into that order, one neighbour at a time (the arrows)", () => {
  const from = ["ONAM", "TNAM", "HNAM", "SONAM", "BNAM", "SNAM"];
  const moves = movesToOrder(from, U);
  const cur = [...from];
  for (const [u, d] of moves) { const i = cur.indexOf(u); [cur[i], cur[i + d]] = [cur[i + d], cur[i]]; }
  assert.deepEqual(cur, U);
  assert.equal(moves.length, 4);
  assert.deepEqual(movesToOrder(U, U), []);
});

test("wiring: the stack pane checks as units are added and offers the order; the picker follows the holes; Modelling codes offers it too", () => {
  const p = readFileSync(new URL("../src/modules/viewer/ModellingPanes.jsx", import.meta.url), "utf8");
  assert.match(p, /if \(toolPane !== "stack" \|\| stackUnits\.length < 2\) return null;/, "only while the pane is open");
  assert.match(p, /movesToOrder\(stackUnits, stackHoles\.order\)\.forEach\(\(\[u, d\]\) => moveStackUnit\(u, d\)\)/);
  assert.match(p, /unitRank \? \[\.\.\.litho_units\]\.sort\(/);
  const m = readFileSync(new URL("../src/components/ModellingCodesPane.jsx", import.meta.url), "utf8");
  assert.match(m, /const r = orderFromHoles\(runs, names\);/);
  assert.match(m, /onClick=\{applyHolesOrder\}/);
  const r = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.ok(!r.includes("Reorder the units with the arrows and run again."), "the run's cancel points to the button");
  for (const l of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"));
    for (const k of ["Use the order from the holes", "The holes give the order {order} (youngest first): {list}.", "Already in the order the holes give."]) assert.ok(d[k], `${l}: ${k}`);
  }
});
