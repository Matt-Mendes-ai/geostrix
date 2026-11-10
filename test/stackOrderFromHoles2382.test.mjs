// TASKS.csv #2382 (review #2325, WA uranium) — a stack order the holes contradict is said before the run, with the order the holes give
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stackOrderFromHoles } from "../src/lib/stackOrderFromHoles.js";

// 10 vertical holes logging QA over H over E1 (one hole has H missing)
const rows = [];
for (let h = 0; h < 10; h++) {
  rows.push({ hole_id: `N${h}`, from: 0, value: "QA" });
  if (h !== 3) rows.push({ hole_id: `N${h}`, from: 4, value: "H" });
  rows.push({ hole_id: `N${h}`, from: 40, value: "E1" });
}

test("the review's reversed stack E1, QA, H: every pair contradicted, and the holes' order QA, H, E1", () => {
  const kOf = new Map([["E1", 0], ["QA", 1], ["H", 2]]); // the order typed, youngest first
  const r = stackOrderFromHoles(rows, kOf, 3);
  assert.deepEqual(r.conflicts.map((q) => [q.younger, q.older, q.against, q.of]), [[0, 1, 10, 10], [0, 2, 9, 9]]);
  assert.deepEqual(r.order.map((k) => ["E1", "QA", "H"][k]), ["QA", "H", "E1"]);
});

test("the right order has no conflict; too few holes say nothing", () => {
  const kOf = new Map([["QA", 0], ["H", 1], ["E1", 2]]);
  assert.equal(stackOrderFromHoles(rows, kOf, 3).conflicts.length, 0);
  assert.equal(stackOrderFromHoles(rows.slice(0, 5), new Map([["E1", 0], ["QA", 1]]), 2).conflicts.length, 0); // 2 holes only
});

test("the stack run asks before solving", () => {
  const m = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(m, /const ord = stackOrderFromHoles\(layers\.litho \|\| \[\], kOf, specs\.length\);/);
  assert.ok(m.indexOf("const ord = stackOrderFromHoles") < m.indexOf('await runSurfaceStack([...faultSpecs, ...specs], { relation: breakAt.size'));
});
