// TASKS.csv #3170 — a six-unit stack on WA iron (150,455 strand intervals) built the hole / depth indexes again for every unit, twice (the
// unit's rows and the raw codes), about 0.6 s of the run's first main-thread task. They are kept per rows array and field now.
import test from "node:test";
import assert from "node:assert/strict";
import { intervalEndIndex, intervalStartIndex, depthIndexAt, continuesUnitAbove } from "../src/lib/viewer/intervals.js";

const rows = [{ hole_id: "A", from: 0, to: 10, value: "X" }, { hole_id: "A", from: 10, to: 20.0004, value: "Y" }, { hole_id: "B", from: 5, to: 6, value: "X" }];

test("the indexes are kept per rows array and field, and read as before", () => {
  const e1 = intervalEndIndex(rows), e2 = intervalEndIndex(rows), s1 = intervalStartIndex(rows);
  assert.equal(e1, e2, "the same index for the same rows");
  assert.notEqual(e1, s1, "the start index is its own");
  assert.equal(intervalStartIndex(rows), s1);
  assert.deepEqual(depthIndexAt(e1, "A", 10), ["X"]);
  assert.deepEqual(depthIndexAt(e1, "A", 20), ["Y"]); // the 1 mm match
  assert.deepEqual(depthIndexAt(s1, "A", 10), ["Y"]);
  assert.equal(continuesUnitAbove(e1, rows[1], new Set(["X"])), true);
  // a new array (as any edit of a layer makes): indexed afresh
  const rows2 = [...rows, { hole_id: "B", from: 6, to: 7, value: "Z" }];
  const e3 = intervalEndIndex(rows2);
  assert.notEqual(e3, e1); assert.deepEqual(depthIndexAt(e3, "B", 7), ["Z"]); assert.equal(depthIndexAt(e1, "B", 7), undefined);
  // not an array: built every time, never kept
  assert.equal(intervalEndIndex(null).size, 0);
});
