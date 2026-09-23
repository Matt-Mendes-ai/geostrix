// TASKS.csv #443 — regression tests for the #330 review's wrong-number fixes (run: npm test).
import test from "node:test";
import assert from "node:assert/strict";
import { computeBestIntercepts, avgGradeInRange, readAssayCell, convertUnit, mergeAssayRows } from "../src/lib/geochem.js";

const U = { Au: "ppm" };
const row = (f, t, v, extra = {}) => ({ hole_id: "H1", from: f, to: t, values: { Au: v }, ...extra });
const one = (rows, opts) => computeBestIntercepts(rows, "Au", "ppm", U, { cutoff: 0.5, ...opts });

test("#331 overlapping re-assay counts each metre once (mean of the overlap)", () => {
  const r = one([row(0, 4, 2), row(1, 2, 5)]);
  assert.equal(r.length, 1);
  assert.equal(r[0].from, 0); assert.equal(r[0].to, 4);
  assert.ok(Math.abs(r[0].avgGrade - 2.375) < 1e-9);
  assert.equal(r[0].overlapM, 1);
});

test("#331 exact duplicate row is counted once", () => {
  const r = one([row(0, 1, 10), row(0, 1, 10), row(1, 2, 1)]);
  assert.ok(Math.abs(r[0].avgGrade - 5.5) < 1e-9);
  assert.equal(r.stats.duplicatesSkipped, 1);
});

test("#332 an intercept never averages below its cutoff", () => {
  const r = one([row(0, 1, 0.5), row(1, 3, 0), row(3, 4, 0.5), row(4, 6, 0), row(6, 7, 0.5)], { maxInternalDilution: 2 });
  for (const i of r) assert.ok(i.avgGrade >= 0.5 - 1e-9, `${i.from}-${i.to} @ ${i.avgGrade}`);
});

test("#333 a -9999 code is never averaged in as a grade", () => {
  const r = one([row(0, 1, 1), row(1, 2, -9999), row(2, 3, 1)]);
  assert.ok(r[0].avgGrade > 0);
  assert.equal(r.stats.negativeValues, 1);
  assert.equal(r[0].unsampledM, 1);
});

test("#402 a '<' value never passes the cutoff; '>' marks a minimum", () => {
  assert.equal(one([row(0, 1, 0.5, { qualifiers: { Au: "<" } })], { cutoff: 0.4 }).length, 0);
  assert.equal(one([row(0, 1, 100, { qualifiers: { Au: ">" } })])[0].overRange, true);
});

test("plain intercept with a gap is unchanged", () => {
  const r = one([row(0, 1, 2), row(1, 2, 0.1), row(3, 4, 3), row(10, 11, 1)], { maxInternalDilution: 2 });
  assert.equal(r.length, 2);
  assert.ok(Math.abs(r[0].avgGrade - 1.275) < 1e-9);
});

test("#331 avgGradeInRange resolves overlaps and duplicates the same way", () => {
  assert.ok(Math.abs(avgGradeInRange([row(0, 4, 2), row(1, 2, 5)], "H1", 0, 4, "Au", "ppm", U) - 2.375) < 1e-9);
  assert.ok(Math.abs(avgGradeInRange([row(0, 1, 10), row(0, 1, 10), row(1, 2, 1)], "H1", 0, 2, "Au", "ppm", U) - 5.5) < 1e-9);
});

test("#333 readAssayCell: negative codes and sentinels", () => {
  assert.deepEqual(readAssayCell("-0.005"), { value: 0.0025, qualifier: "<", kind: "neg_bdl" });
  assert.equal(readAssayCell("-9999").value, null);
  assert.equal(readAssayCell("-0.005", "missing").value, null);
  assert.equal(readAssayCell("<0.01").value, 0.005);
  assert.equal(readAssayCell(">100").qualifier, ">");
});

test("#334 convertUnit", () => {
  assert.equal(convertUnit(500, "ppb", "ppm"), 0.5);
  assert.equal(convertUnit(1.2, "%", "ppm"), 12000);
  assert.equal(convertUnit(null, "ppb", "ppm"), null);
});

test("#336 mergeAssayRows updates in place, keeps other elements, appends new intervals", () => {
  const a = [{ hole_id: "H", from: 0, to: 1, source: "assay", values: { Au: 1 }, qualifiers: { Au: "<" } }];
  const r = mergeAssayRows(a, [{ hole_id: "H", from: 0, to: 1, source: "assay", values: { Au: 2, Cu: 5 } }, { hole_id: "H", from: 1, to: 2, source: "assay", values: { Au: 3 } }]);
  assert.equal(r.merged, 1); assert.equal(r.added, 1);
  assert.deepEqual(r.rows[0].values, { Au: 2, Cu: 5 });
  assert.equal(r.rows[0].qualifiers, undefined);
});
