// TASKS.csv #3230 (#2925 (2)) — QAQC duplicates: the repeated same-interval rows counted with the tick off (the header says how many there are
// to read), and a repeated pair ordered by sample id (the lower id is the original)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { duplicatePairs } from "../src/lib/qaqc.js";

const U = { Au: "ppm" };
const rows = [
  { hole_id: "H1", from: 0, to: 1, sample_id: "S10", values: { Au: 1.2 } },
  { hole_id: "H1", from: 0, to: 1, sample_id: "S9", values: { Au: 1.0 } }, // repeated, lower id: the original
  { hole_id: "H1", from: 1, to: 2, sample_id: "S11", values: { Au: 0.5 } },
  { hole_id: "H1", from: 1, to: 2, sample_id: "S12", values: { Au: 0.6 } },
  { hole_id: "H1", from: 2, to: 3, values: { Au: 0.3 } },
];

test("counted with the tick off; the lower sample id is the original", () => {
  const off = duplicatePairs(rows, "Au", U);
  assert.equal(off.length, 0); assert.equal(off.repeatedRows, 2);
  const on = duplicatePairs(rows, "Au", U, undefined, { repeatedIntervals: true });
  const p0 = on.find((p) => p.from === 0), p1 = on.find((p) => p.from === 1);
  assert.equal(p0.v1, 1.0, "S9 is the original"); assert.equal(p0.v2, 1.2); assert.equal(p0.sample_id, "S10");
  assert.equal(p1.v1, 0.5); assert.equal(p1.v2, 0.6, "already in order");
});

test("wiring: the header says how many repeated rows there are with the tick off", () => {
  const s = readFileSync(new URL("../src/components/QAQCPanel.jsx", import.meta.url), "utf8");
  assert.match(s, /!repeatedAsDup && dups\.repeatedRows > 0 \? tr\("\{n\} repeated same-interval row\(s\): tick to read them as duplicate pairs/);
});
