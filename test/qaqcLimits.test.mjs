// TASKS.csv #534 — QAQC limits per element and per duplicate type; chart order.
import test from "node:test";
import assert from "node:assert/strict";
import { duplicateKind, duplicateSummary, DUP_RPD_LIMITS, suggestDetectionLimit, orderForControlChart, sampleTypeClass } from "../src/lib/qaqc.js";

test("#534 duplicate kind from the sample type / QC code", () => {
  assert.equal(duplicateKind({ sample_type: "Field Duplicate" }), "field");
  assert.equal(duplicateKind({ sample_type: "DUP", qc_code: "quarter core" }), "field");
  assert.equal(duplicateKind({ sample_type: "Coarse reject dup" }), "coarse");
  assert.equal(duplicateKind({ sample_type: "Prep duplicate" }), "coarse");
  assert.equal(duplicateKind({ sample_type: "Pulp Dup" }), "pulp");
  assert.equal(duplicateKind({ sample_type: "lab rep" }), "pulp");
  assert.equal(duplicateKind({ sample_type: "DUP" }), "unknown");
});

test("#534 each pair is judged against its own kind's RPD limit", () => {
  const pairs = [
    { kind: "field", rpd: 25 }, { kind: "field", rpd: 35 },
    { kind: "pulp", rpd: 8 }, { kind: "pulp", rpd: 15 },
    { kind: "unknown", rpd: 18 }, { kind: "pulp", rpd: 50, belowLimit: true },
  ];
  const s = duplicateSummary(pairs, DUP_RPD_LIMITS);
  assert.equal(s.used, 5); assert.equal(s.below, 1);
  assert.equal(s.within, 3); // field 25 (<=30), pulp 8 (<=10), unknown 18 (<=20)
  assert.deepEqual(s.byKind.field, { used: 2, within: 1, limit: 30 });
  assert.deepEqual(s.byKind.pulp, { used: 2, within: 1, limit: 10 });
  assert.equal(duplicateSummary(pairs, 20).within, 3); // the old single limit still works (8, 15, 18)
});

test("#534 detection limit suggested from the lab's '<x' results, else the lowest value", () => {
  const rows = [
    { values: { Au: 0.0025 }, qualifiers: { Au: "<" } }, { values: { Au: 0.0025 }, qualifiers: { Au: "<" } },
    { values: { Au: 0.005 }, qualifiers: { Au: "<" } }, { values: { Au: 0.31 } }, { values: { Au: 1.2 } },
  ];
  assert.deepEqual(suggestDetectionLimit(rows, "Au"), { limit: 0.005, basis: "lt", n: 2 });
  assert.deepEqual(suggestDetectionLimit([{ values: { Cu: 4 } }, { values: { Cu: 2 } }], "Cu"), { limit: 2, basis: "min" });
  assert.deepEqual(suggestDetectionLimit([], "Cu"), { limit: null, basis: null });
});

test("#534 control chart in sample-id order (natural), import order without ids", () => {
  const r = [{ sample_id: "S10" }, { sample_id: "S9" }, { sample_id: "S100" }];
  assert.deepEqual(orderForControlChart(r).rows.map((x) => x.sample_id), ["S9", "S10", "S100"]);
  assert.equal(orderForControlChart([{ sample_id: "A" }, {}]).bySampleId, false);
});

test("#534 coarse-reject / prep / lab duplicate labels are duplicates (were read as drill samples)", () => {
  for (const t of ["Coarse reject dup", "Coarse Reject Duplicate", "Prep Duplicate", "CRD", "Lab rep", "Lab Duplicate", "Reject dup"]) assert.equal(sampleTypeClass(t), "duplicate", t);
  assert.equal(duplicateKind({ sample_type: "CRD" }), "coarse");
  assert.equal(duplicateKind({ sample_type: "FD" }), "field");
  assert.equal(duplicateKind({ sample_type: "PD" }), "pulp");
  assert.equal(sampleTypeClass("Core"), "regular");
  assert.equal(sampleTypeClass("Coarse blank"), "blank");
});
