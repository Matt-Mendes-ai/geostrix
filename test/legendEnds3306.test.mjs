// TASKS.csv #3306 (#3260's follow-up) — an element whose classes must be cut keeps its lowest and highest classes (both ends of its range),
// and its heading says how many it shows of how many; one row left keeps the highest.
import test from "node:test";
import assert from "node:assert/strict";
import { allocateLegendRows } from "../src/lib/legendGroups.js";

const grade = (n) => ({ label: "Cu (ppm)", grade: true, items: Array.from({ length: n }, (_, i) => [`c${i}`, "#000"]) });
const lith = { label: "Lithology", items: Array.from({ length: 12 }, (_, i) => [`l${i}`, "#111"]), counts: Array(12).fill(1) };

test("three rows of six classes: the lowest and the two highest, '3 of 6'", () => {
  const { rows } = allocateLegendRows([grade(6), lith], 6);
  const cu = rows.filter((r) => r.group === "Cu (ppm)");
  assert.deepEqual(cu.map((r) => r.label), ["c0", "c4", "c5"]);
  assert.deepEqual(cu[0].classesShown, [3, 6]);
});

test("one row: the highest; all rows: every class in order, no count", () => {
  assert.deepEqual(allocateLegendRows([grade(6), { ...lith, items: lith.items.slice(0, 1), counts: [1] }], 2).rows.filter((r) => r.group === "Cu (ppm)").map((r) => r.label), ["c5"]);
  const all = allocateLegendRows([grade(6)], 10).rows;
  assert.deepEqual(all.map((r) => r.label), ["c0", "c1", "c2", "c3", "c4", "c5"]);
  assert.ok(!all.some((r) => r.classesShown));
});
