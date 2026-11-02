// TASKS.csv #1164, #1290 — the optional columns of the Best intercepts table appear in one order, header and rows
import test from "node:test";
import assert from "node:assert/strict";
import { optionalInterceptColumns } from "../src/lib/drillReportExport.js";

test("#1164 Including comes before the metal equivalent, and a column that is off is not there", () => {
  assert.deepEqual(optionalInterceptColumns({ including: true, metalEquivalent: true }), ["including", "meq"]);
  assert.deepEqual(optionalInterceptColumns({ including: true, metalEquivalent: false }), ["including"]);
  assert.deepEqual(optionalInterceptColumns({ including: false, metalEquivalent: true }), ["meq"]);
  assert.deepEqual(optionalInterceptColumns({ including: false, metalEquivalent: false }), []);
});
