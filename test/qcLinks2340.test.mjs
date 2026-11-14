// TASKS.csv #2340 (review #2325, WA uranium) — the QC link table (Orig_SampleID, QC_Category) had no route: Orig_SampleID was not guessed as the
// parent sample, QC_Category not as the sample type, a pXRF file's repeated Sample_Type took its blank copy, and a link-only table (ids, no
// results) said only '0 elements'. SYNTHETIC headers and rows.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { qcColumns } from "../src/lib/assayQcColumns.js";

test("Orig_SampleID is the parent sample and QC_Category the sample type", () => {
  const q = qcColumns(["Hole_ID", "mFrom", "mTo", "SampleID", "Orig_SampleID", "QC_Category"]);
  assert.equal(q.sample_id, "SampleID");
  assert.equal(q.parent_id, "Orig_SampleID");
  assert.equal(q.sample_type, "QC_Category");
  for (const h of ["Parent_ID", "Original_Sample", "Orig_Sample", "ParentID"]) assert.equal(qcColumns(["SampleID", h]).parent_id, h, h);
  assert.equal(qcColumns(["SampleID", "QC_Type"]).sample_type, "QC_Type");
});

test("a header the file has twice: the copy with values (the parser names the second '_1')", () => {
  const headers = ["Hole_ID", "Sample_ID", "Sample_Type", "Cu_ppm", "Sample_Type_1"];
  const rows = [{ Sample_Type: "", Sample_Type_1: "WCORE" }, { Sample_Type: "", Sample_Type_1: "ORIG" }];
  assert.equal(qcColumns(headers, rows).sample_type, "Sample_Type_1");
  assert.equal(qcColumns(headers, [{ Sample_Type: "ORIG", Sample_Type_1: "x" }]).sample_type, "Sample_Type", "the first, when it has values");
  assert.equal(qcColumns(headers).sample_type, "Sample_Type", "no rows: by name, as before");
});

test("a link-only table says what it is; the dialog's guesses read the rows", () => {
  const d = fs.readFileSync(new URL("../src/components/AssayImportModal.jsx", import.meta.url), "utf8");
  assert.ok(d.includes("This table links check samples to their originals ({cols}) but holds no results"));
  const g = fs.readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
  assert.equal((g.match(/qc: qcColumns\(headers, data\)/g) || []).length, 2);
});
