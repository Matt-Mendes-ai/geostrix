// TASKS.csv #737 — the lazy duplicate test gives the same answers as the old full hole|from|to|values key.
import test from "node:test";
import assert from "node:assert/strict";
import { countDuplicateAssayIntervals, compositeDownhole } from "../src/lib/geochem.js";

const row = (from, to, cu, hole = "A") => ({ hole_id: hole, from, to, values: { Cu: cu } });

test("duplicates and conflicts, including a repeat of the second variant", () => {
  const rows = [row(0, 1, 5), row(0, 1, 5), row(0, 1, 7), row(0, 1, 7), row(0, 1, 5), row(1, 2, 3), row(1, 2, 3, "B")];
  assert.deepEqual(countDuplicateAssayIntervals(rows), { exactDuplicates: 3, conflictingIntervals: 1 });
});

test("a doubled metre is composited once; a conflicting one is averaged", () => {
  const units = { Cu: "ppm" };
  const doubled = compositeDownhole([row(0, 1, 10), row(0, 1, 10), row(1, 2, 2)], "Cu", "ppm", units, { length: 2 });
  assert.equal(doubled[0].avgGrade, 6);
  const conflict = compositeDownhole([row(0, 1, 10), row(0, 1, 4), row(1, 2, 2)], "Cu", "ppm", units, { length: 2 });
  assert.ok(conflict[0].conflictLength > 0);
});
