// TASKS.csv #1665 — two-row headers in xlsx and CSV; continuation rows with a blank hole id
import { test } from "node:test";
import assert from "node:assert/strict";
import { fillDownHoleIds } from "../src/lib/viewer/importHelpers.js";

test("a blank hole id whose From continues the row above takes its hole id; a deeper restart or a blank From does not", () => {
  const m = { hole_id: "Hole", from: "Alt From" };
  const rows = [
    { Hole: "A-1", "Alt From": "0" }, { Hole: "A-1", "Alt From": "5" },
    { Hole: "", "Alt From": "9" }, { Hole: "", "Alt From": "14" }, // A-1's alteration continuing
    { Hole: "", "Alt From": "" }, // an empty row of the lithology table
    { Hole: "B-2", "Alt From": "0" }, { Hole: "", "Alt From": "3" },
    { Hole: "", "Alt From": "1" }, // depth goes back: not a continuation
  ];
  const r = fillDownHoleIds(rows, m);
  assert.equal(r.filled, 3);
  assert.deepEqual(r.rows.map((x) => x.Hole), ["A-1", "A-1", "A-1", "A-1", "", "B-2", "B-2", ""]);
  assert.equal(rows[2].Hole, "", "the input rows are not changed");
  assert.equal(fillDownHoleIds(rows, { hole_id: "Hole" }).filled, 0, "no From column: nothing filled");
});
