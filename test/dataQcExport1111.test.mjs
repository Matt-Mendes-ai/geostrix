// TASKS.csv #1111 — the Data QC issue list as CSV rows, errors first
import { test } from "node:test";
import assert from "node:assert/strict";
import { qcIssueRows, runDataQC } from "../src/lib/dataQC.js";

test("#1111 rows: severity, category, hole_id, message; errors, then warnings, then information", () => {
  const rows = qcIssueRows([
    { severity: "info", category: "c", holeId: null, message: "i1" },
    { severity: "error", category: "a", holeId: "DH1", message: "e1" },
    { severity: "warning", category: "b", holeId: "DH2", message: "w1" },
    { severity: "error", category: "a", holeId: "DH3", message: "e2" },
  ]);
  assert.deepEqual(rows.map((r) => r.message), ["e1", "e2", "w1", "i1"]);
  assert.deepEqual(Object.keys(rows[0]), ["severity", "category", "hole_id", "message"]);
  assert.equal(rows[3].hole_id, "");
});

test("#1111 a real QC run exports one row per issue", () => {
  const res = runDataQC({ project: {}, collars: [{ hole_id: "A", x: 0, y: 0, z: 0, length: 50 }], survey: [], layers: { litho: [{ hole_id: "B", from: 0, to: 5, value: "X" }] }, boundaries: [], assays: [] });
  assert.equal(qcIssueRows(res.issues).length, res.issues.length);
  assert.ok(res.issues.length > 0);
});
