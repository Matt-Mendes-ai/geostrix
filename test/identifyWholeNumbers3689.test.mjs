// TASKS.csv #3689 — Identify printed a collar's year as 'year 1,984': a whole number of up to five digits (a year, a hole number, an EPSG code) has no grouping.
import test from "node:test";
import assert from "node:assert/strict";
import { attributeFields } from "../src/lib/viewer/identify.js";

test("whole numbers under 100,000 print as they are; decimals and big numbers keep their grouping", () => {
  const f = Object.fromEntries(attributeFields({ year: 1984, epsg: 26909, hole_no: 7, depth: 1234.5, count: 1250000, neg: -2017, name: "A1" }, new Set()));
  assert.equal(f.year, "1984");
  assert.equal(f.epsg, "26909");
  assert.equal(f.hole_no, "7");
  assert.equal(f.neg, "-2017");
  assert.equal(f.depth, (1234.5).toLocaleString(undefined, { maximumFractionDigits: 4 }));
  assert.equal(f.count, (1250000).toLocaleString(undefined, { maximumFractionDigits: 4 }));
  assert.equal(f.name, "A1");
});
