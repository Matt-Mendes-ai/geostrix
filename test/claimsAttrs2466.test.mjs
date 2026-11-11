// TASKS.csv #2466 — a tenement file's claim keeps its tenement id (TEN_ID / TENID / TENEMENT, LEASE_NO) and the status the file gives
// (LIVE / PENDING / DEAD …), also when the file holds a single feature; the status is not forced to Active.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { vectorToBoundaryPolylines, claimsFromVector, claimStatusOf } from "../src/lib/boundaryImport.js";
const read = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");
const ring = (x) => [[x, 0], [x + 100, 0], [x + 100, 100], [x, 100], [x, 0]];

test("#2466 tenement id and status columns are read, one feature included", async () => {
  const one = { geomType: "polygon", epsg: 28351, features: [{ parts: [ring(0)], attributes: { TEN_ID: "E 29/1234", TENSTATUS: "LIVE", HOLDER1: "x" } }] };
  const r1 = await vectorToBoundaryPolylines(one, 28351);
  const c1 = claimsFromVector(r1, "tenements");
  assert.equal(c1.length, 1);
  assert.deepEqual([c1[0].name, c1[0].tenureNumber, c1[0].status], ["tenements", "E 29/1234", "active"]);

  const many = { geomType: "polygon", epsg: 28351, features: [
    { parts: [ring(0)], attributes: { TENEMENT: "M 29/88", STATUS: "Pending" } },
    { parts: [ring(300)], attributes: { TENEMENT: "P 29/7", STATUS: "DEAD" } },
    { parts: [ring(600)], attributes: { TENEMENT: "L 29/2", STATUS: "something else" } },
  ] };
  const c = claimsFromVector(await vectorToBoundaryPolylines(many, 28351), "t");
  assert.deepEqual(c.map((x) => [x.tenureNumber, x.status]), [["M 29/88", "pending"], ["P 29/7", "expired"], ["L 29/2", undefined]]);
  const lease = claimsFromVector(await vectorToBoundaryPolylines({ geomType: "polygon", epsg: 28351, features: [{ parts: [ring(0)], attributes: { LEASE_NO: 42 } }] }, 28351), "l");
  assert.equal(lease[0].tenureNumber, "42");
});

test("#2466 status words", () => {
  for (const v of ["LIVE", "Granted", "active", "Good Standing"]) assert.equal(claimStatusOf(v), "active", v);
  for (const v of ["Pending", "APPLICATION"]) assert.equal(claimStatusOf(v), "pending", v);
  for (const v of ["Expired", "dead", "Surrendered", "forfeited"]) assert.equal(claimStatusOf(v), "expired", v);
  for (const v of ["", null, undefined, "unknown"]) assert.equal(claimStatusOf(v), null);
});

test("#2466 the Claims import keeps the file's status", () => {
  const g = read("modules/GeophysicsModule.jsx");
  assert.match(g, /status: c\.status \|\| "active"/);
  assert.match(g, /color: claimStatusColor\(c\.status \|\| "active"\)/);
});
