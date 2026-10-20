// TASKS.csv #579 — repeated same-interval rows (no sample-type column) as QAQC duplicate pairs.
import test from "node:test";
import assert from "node:assert/strict";
import { duplicatePairs } from "../src/lib/qaqc.js";

const U = { Au: "ppm" };
const r = (from, to, Au, hole_id = "H1") => ({ hole_id, from, to, values: { Au } });
const assays = [r(0, 1, 1.0), r(0, 1, 1.2), r(1, 2, 3), r(1, 2, 3), r(2, 3, 5)];

test("#579 off by default: no pairs without a QC marker", () => {
  assert.equal(duplicatePairs(assays, "Au", U).length, 0);
});

test("#579 on: 1st row = original, 2nd = duplicate; identical repeats skipped as double imports", () => {
  const p = duplicatePairs(assays, "Au", U, undefined, { repeatedIntervals: true });
  assert.equal(p.length, 1);
  assert.deepEqual([p[0].v1, p[0].v2, p[0].how], [1.0, 1.2, "repeated interval"]);
  assert.ok(Math.abs(p[0].rpd - (0.2 / 1.1) * 100) < 1e-9);
  assert.equal(p.identicalRepeats, 1);
});
