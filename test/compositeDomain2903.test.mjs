// TASKS.csv #2903 (WA iron review) — 'Honour domain' on a log recorded sample by sample (ALU 0-2, ALU 2-4, ALU 4-6, CLA 6-8 …) broke at both
// edges of every row, so 4 m and 6 m composites came back as one 2 m piece per raw sample
import test from "node:test";
import assert from "node:assert/strict";
import { compositeDownhole, mergeTouchingDomainRows } from "../src/lib/geochem.js";

const units = { Fe: "%" };
const assays = Array.from({ length: 12 }, (_, k) => ({ hole_id: "H1", from: 2 * k, to: 2 * k + 2, values: { Fe: 20 + k } }));
// ALU 0-6 (three rows), CLA 6-8, ALU 8-12 (two rows), BIF 12-24 (six rows): one row per sample, as an RC chip log is
const codes = ["ALU", "ALU", "ALU", "CLA", "ALU", "ALU", "BIF", "BIF", "BIF", "BIF", "BIF", "BIF"];
const litho = codes.map((value, k) => ({ hole_id: "H1", from: 2 * k, to: 2 * k + 2, value }));
const iv = (cs) => cs.map((c) => [c.from, c.to]);

test("mergeTouchingDomainRows: touching rows of one value join; a change of value or a gap keeps the edge", () => {
  assert.deepEqual(mergeTouchingDomainRows(litho).map((r) => [r.from, r.to, r.value]), [[0, 6, "ALU"], [6, 8, "CLA"], [8, 12, "ALU"], [12, 24, "BIF"]]);
  assert.deepEqual(mergeTouchingDomainRows([{ from: 0, to: 2, value: "A" }, { from: 3, to: 5, value: "A" }]).length, 2, "a gap is an edge");
  assert.deepEqual(mergeTouchingDomainRows([{ from: 0, to: 4, value: "A" }, { from: 3, to: 5, value: "A" }]).map((r) => [r.from, r.to]), [[0, 5]], "an overlap of one value");
  assert.equal(litho[0].to, 2, "the caller's rows are not changed");
});

test("compositeDownhole with the domain: 6 m composites within each domain interval, not one per sample", () => {
  const six = compositeDownhole(assays, "Fe", "%", units, { length: 6, minCoverage: 0, domainRows: litho });
  assert.deepEqual(iv(six), [[0, 6], [6, 8], [8, 12], [12, 18], [18, 24]]);
  assert.deepEqual(six.map((c) => c.domain), ["ALU", "CLA", "ALU", "BIF", "BIF"]);
  const four = compositeDownhole(assays, "Fe", "%", units, { length: 4, minCoverage: 0, domainRows: litho });
  assert.deepEqual(iv(four), [[0, 4], [4, 6], [6, 8], [8, 12], [12, 16], [16, 20], [20, 24]]);
  // the grade of the first 6 m: the mean of 20, 21, 22
  assert.ok(Math.abs(six[0].avgGrade - 21) < 1e-9, JSON.stringify(six[0]));
  // without the domain, as before: 0-6, 6-12, 12-18, 18-24
  assert.deepEqual(iv(compositeDownhole(assays, "Fe", "%", units, { length: 6, minCoverage: 0 })), [[0, 6], [6, 12], [12, 18], [18, 24]]);
});
