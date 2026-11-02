// TASKS.csv #1333 — selecting intervals with a box and giving them one modelling code.
import test from "node:test";
import assert from "node:assert/strict";
import { segmentTouchesBox, intervalTouchesBox, combineSelection, holesOf, rowsBetween, codeRowsAs, holesWithRepeats, rowsOfCode, replaceCodeWith, uncodeRows, holeCounts } from "../src/lib/intervalBox.js";
const effectiveCodeOf = (r, mc) => effectiveCode(r, mc);
import { effectiveCode, topsForCode, codedRuns } from "../src/lib/modellingCodes.js";

const box = { x0: 10, y0: 10, x1: 20, y1: 20 };
const row = (hole_id, from, to, value) => ({ hole_id, from, to, value });

test("a segment touches a box when an end is inside or it only passes through", () => {
  assert.equal(segmentTouchesBox([15, 15], [100, 100], box), true);
  assert.equal(segmentTouchesBox([0, 15], [100, 15], box), true);
  assert.equal(segmentTouchesBox([0, 0], [100, 100], box), true);
  assert.equal(segmentTouchesBox([0, 15], [9, 15], box), false);
  assert.equal(segmentTouchesBox([0, 30], [30, 30], box), false);
  assert.equal(segmentTouchesBox([0, 12], [12, 0], box), false); // crosses the box's corner region only
});

test("a point behind the camera does not make a line across the screen", () => {
  assert.equal(intervalTouchesBox([[15, 15], null], box), false);
  assert.equal(intervalTouchesBox([null, [0, 15], [100, 15]], box), true);
});

test("a drag replaces the selection, Shift adds, Ctrl removes", () => {
  const a = row("H", 0, 1, "A"), b = row("H", 1, 2, "B"), c = row("H", 2, 3, "C");
  assert.deepEqual(combineSelection([a], [b], "replace"), [b]);
  assert.deepEqual(combineSelection([a, b], [b, c], "add"), [a, b, c]);
  assert.deepEqual(combineSelection([a, b], [{ ...a }], "remove"), [b]);
  assert.equal(holesOf([a, row("K", 0, 1, "A")]), 2);
});

const litho = [row("H", 0, 10, "OB"), row("H", 10, 20, "QSP"), row("H", 20, 30, "AND"), row("H", 30, 40, "QSP"), row("H", 40, 50, "AND"), row("K", 5, 15, "QSP")];

test("the rows between the first and last selected, hole by hole", () => {
  assert.deepEqual(rowsBetween(litho, [litho[1], litho[3], litho[5]]), [litho[2]]);
  assert.deepEqual(rowsBetween(litho, [litho[1], litho[5]]), []);
});

test("several intervals per hole get one code; other rows and earlier codes are kept", () => {
  const before = { codes: [{ name: "X", role: "intrusion" }], assign: { "H|40.000|50.000": "X" }, ties: [] };
  const mc = codeRowsAs(before, [litho[1], litho[3], litho[5]], "Q1");
  assert.equal(effectiveCode(litho[1], mc), "Q1");
  assert.equal(effectiveCode(litho[3], mc), "Q1");
  assert.equal(effectiveCode(litho[2], mc), "AND");
  assert.equal(effectiveCode(litho[4], mc), "X");
  assert.deepEqual(mc.codes.map((c) => c.name), ["X", "Q1"]);
  assert.deepEqual(codeRowsAs(mc, [litho[5]], "Q1").codes.map((c) => c.name), ["X", "Q1"]);
  assert.equal(Object.keys(before.assign).length, 1);
});

test("repeated runs are counted, and bridging them leaves one top per hole", () => {
  const apart = codeRowsAs(null, [litho[1], litho[3], litho[5]], "Q1");
  assert.equal(holesWithRepeats(litho, apart, "Q1"), 1);
  assert.equal(topsForCode(codedRuns(litho, apart), "Q1", apart).tops.length, 2);
  const whole = codeRowsAs(null, [litho[1], litho[2], litho[3], litho[5]], "Q1");
  assert.equal(holesWithRepeats(litho, whole, "Q1"), 0);
  assert.equal(topsForCode(codedRuns(litho, whole), "Q1", whole).tops.length, 1);
});

test("#1337: a code's intervals can be listed, replaced and handed back", () => {
  const litho = [
    { hole_id: "A", from: 0, to: 10, value: "QSP" }, { hole_id: "A", from: 10, to: 20, value: "AND" },
    { hole_id: "B", from: 0, to: 10, value: "QSP" }, { hole_id: "C", from: 0, to: 10, value: "NEW" },
  ];
  const first = codeRowsAs(null, [litho[0], litho[2]], "NEW");
  assert.equal(rowsOfCode(litho, first, "NEW").length, 3); // two overrides, one logged as NEW
  const added = codeRowsAs(first, [litho[1]], "NEW");
  assert.equal(rowsOfCode(litho, added, "NEW").length, 4); // adding is what caught earlier tries
  const replaced = replaceCodeWith(added, [litho[1]], "NEW");
  assert.deepEqual(rowsOfCode(litho, replaced, "NEW").map((r) => r.hole_id).sort(), ["A", "C"]); // C is logged as NEW and stays
  assert.equal(effectiveCodeOf(litho[0], replaced), "QSP");
  const other = codeRowsAs(first, [litho[1]], "OTHER");
  assert.equal(rowsOfCode(litho, replaceCodeWith(other, [litho[0]], "NEW"), "OTHER").length, 1); // another code's overrides stay
  const back = uncodeRows(first, [litho[0]]);
  assert.equal(effectiveCodeOf(litho[0], back), "QSP");
  assert.equal(effectiveCodeOf(litho[2], back), "NEW");
  assert.deepEqual(holeCounts([litho[0], litho[1], litho[2]]), [["A", 2], ["B", 1]]);
});
