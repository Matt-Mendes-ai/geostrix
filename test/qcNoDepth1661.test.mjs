// TASKS.csv #1661 (review #1646, Kodiak) — standards and blanks with no depths are QC records, kept for QAQC
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { qcColumns, qcFields } from "../src/lib/assayQcColumns.js";
import { isMarkedQcRow } from "../src/lib/qaqc.js";

test("#1661 Kodiak's columns are guessed: Parent Sample Number and Standard Type", () => {
  const cols = qcColumns(["Hole ID", "From", "To", "Sample", "Sample Type", "Parent Sample Number", "Standard Type", "Cu_ppm"]);
  assert.deepEqual(cols, { sample_id: "Sample", sample_type: "Sample Type", parent_id: "Parent Sample Number", qc_code: "Standard Type", certificate: "" }); // certificate: #2764
});

test("#1661 a 'Control' row with a CRM name is a standard; with BLK-SiO2 a blank; a plain REG row is untouched", () => {
  const cols = qcColumns(["Sample", "Sample Type", "Parent Sample Number", "Standard Type"]);
  const std = qcFields({ Sample: "K1", "Sample Type": "Control", "Standard Type": "STD1409" }, cols);
  assert.equal(std.sample_type, "standard"); assert.equal(std.sample_type_src, "Control"); assert.equal(std.qc_code, "STD1409");
  assert.ok(isMarkedQcRow(std));
  const blk = qcFields({ Sample: "K2", "Sample Type": "Control", "Standard Type": "BLK-SiO2" }, cols);
  assert.equal(blk.sample_type, "blank");
  const reg = qcFields({ Sample: "K3", "Sample Type": "REG", "Standard Type": "" }, cols);
  assert.equal(reg.sample_type, "REG"); assert.ok(!("sample_type_src" in reg));
  const ctrlNoCrm = qcFields({ Sample: "K4", "Sample Type": "Control" }, cols);
  assert.equal(ctrlNoCrm.sample_type, "Control", "no CRM name: the label is left as it is");
});

test("#1661 the assay commit keeps a marked QC row without depths and counts it apart", () => {
  const g = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
  assert.ok(g.includes('if (c === "standard" || c === "blank" || c === "duplicate") { qcNoDepth[c]++; r.from = null; r.to = null; return true; }'));
  assert.ok(g.includes("QC insert(s) without depths kept for QAQC"));
  const sl = readFileSync(new URL("../src/components/StripLog.jsx", import.meta.url), "utf8");
  assert.ok(sl.includes("Number.isFinite(a.from) && Number.isFinite(a.to)).sort"));
});
