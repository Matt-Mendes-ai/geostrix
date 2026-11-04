// TASKS.csv #1794 (review #1646, Kodiak) — the QC-type column told from the medium; QC records deduplicated on re-import
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { looksLikeQcTypeColumn, mergeQcRecords, qcRecordFromFileRow } from "../src/lib/surfaceQaqc.js";

const medium = (m) => (/soil|rock|silt|stream/.test(m) ? m : null);

test("#1794 a column of REG / DUP / Control is a QC type; a column of media is not; a mixed column is not", () => {
  assert.equal(looksLikeQcTypeColumn(["REG", "REG", "DUP", "Control", "REG", ""], medium), true);
  assert.equal(looksLikeQcTypeColumn(["soil", "soil", "rock chip", "DUP"], medium), false, "a medium in the column: it is the medium");
  assert.equal(looksLikeQcTypeColumn(["A1", "B2", "C3"], medium), false);
  assert.equal(looksLikeQcTypeColumn([], medium), false);
});

test("#1794 a re-import replaces the QC records it already brought (by kind and sample id); records without an id are added", () => {
  const prev = [{ id: "a", kind: "duplicate", sample_id: "S1", values: { Cu: 10 } }, { id: "b", kind: "standard", sample_id: "S2", values: { Cu: 400 } }];
  const inc = [{ id: "x", kind: "duplicate", sample_id: "S1", values: { Cu: 11 } }, { id: "y", kind: "blank", sample_id: "S3", values: {} }, { id: "z", kind: "blank", sample_id: "", values: {} }];
  const r = mergeQcRecords(prev, inc);
  assert.equal(r.replaced, 1); assert.equal(r.added, 2); assert.equal(r.records.length, 4);
  assert.equal(r.records[0].id, "a", "the held record keeps its id"); assert.equal(r.records[0].values.Cu, 11);
  assert.equal(mergeQcRecords(r.records, inc).records.length, 5, "the id-less blank is added again; the others are not");
});

test("#1794 the import guesses the QC type apart and uses it before the medium", () => {
  const g = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
  assert.ok(g.includes("looksLikeQcTypeColumn(data.map((r) => r[mapping.medium]), surfaceMediumOf)"));
  assert.ok(g.includes("const qcCol = mapping.qcType || mapping.medium;"));
  assert.ok(g.includes("mergeQcRecords(prev?.records || [], qcRecords).records"));
  assert.ok(readFileSync(new URL("../src/components/SurfaceImportModal.jsx", import.meta.url), "utf8").includes('setMapping("qcType", e.target.value)'));
});

test("#1794 a 'Control' row with a CRM name in a Standard Type column is a standard (a blank when the name says BLK)", () => {
  const std = qcRecordFromFileRow({ sample_id: "045701", type: "Control", values: { Cu: 730 }, attrs: { "Standard Type": "STD-OREAS45" } });
  assert.equal(std.kind, "standard"); assert.equal(std.code, "STD-OREAS45");
  assert.equal(qcRecordFromFileRow({ sample_id: "x", type: "Control", values: {}, attrs: { "Standard Type": "BLK-SiO2" } }).kind, "blank");
  assert.equal(qcRecordFromFileRow({ sample_id: "y", type: "Control", values: {}, attrs: {} }), null, "no CRM name: not a QC record");
  assert.equal(qcRecordFromFileRow({ sample_id: "z", type: "REG", values: {}, attrs: { "Standard Type": "" } }), null);
});
