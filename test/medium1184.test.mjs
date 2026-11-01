// TASKS.csv #1184 QC columns in the assay import; #1286 styling marks a project unsaved; #1313 the diagrams leave the startup bundle
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { qcColumns, qcFields } from "../src/lib/assayQcColumns.js";
import { stylingKey, stylingTracker } from "../src/lib/viewerDirty.js";

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("#1184 SAMPLE, SAMPLE_TYPE and PARENT are found", () => {
  const c = qcColumns(["HOLEID", "FROM_M", "TO_M", "SAMPLE", "SAMPLE_TYPE", "PARENT", "Au_ppm"]);
  assert.deepEqual(c, { sample_id: "SAMPLE", sample_type: "SAMPLE_TYPE", parent_id: "PARENT", qc_code: "" });
  assert.equal(qcColumns(["CRM"]).qc_code, "CRM");
  assert.equal(qcColumns(["Au"]).sample_id, "");
});

test("#1184 one PARENT column: a standard's is its CRM, a duplicate's is its original", () => {
  const cols = { sample_id: "S", sample_type: "T", parent_id: "P", qc_code: "" };
  const std = qcFields({ S: "A1", T: "Standard", P: "OREAS 252" }, cols);
  assert.equal(std.qc_code, "OREAS 252");
  const dup = qcFields({ S: "A2", T: "Duplicate", P: "A1" }, cols);
  assert.equal(dup.parent_id, "A1");
  assert.equal(dup.qc_code, undefined);
  assert.deepEqual(qcFields({ S: "", T: null }, cols), {}, "blanks stay out");
  assert.equal(qcFields({ S: "A1", T: "Standard", P: "x", C: "OREAS 45" }, { ...cols, qc_code: "C" }).qc_code, "OREAS 45", "a real CRM column wins");
});

test("#1286 styling edits count, the first value and other fields do not", () => {
  const t = stylingTracker();
  assert.equal(t({ legendOverride: {}, layerVisible: { a: 1 } }, 1), false, "the baseline");
  assert.equal(t({ legendOverride: {}, layerVisible: { a: 0 } }, 1), false, "visibility is a view");
  assert.equal(t({ legendOverride: { x: "#f00" } }, 1), true);
  assert.equal(t({ legendOverride: { x: "#f00" } }, 1), false, "unchanged");
  assert.equal(t({ legendOverride: { x: "#0f0" } }, 2), false, "another project: a new baseline");
  assert.equal(stylingKey(null), null);
  assert.match(read("src/lib/store.jsx"), /stylingChanged\.current\(viewerUiState, viewerUiStateSeq\)/);
});

test("#1313 the startup code does not import the diagrams", () => {
  for (const f of ["src/lib/geochem.js", "src/App.jsx", "src/modules/ViewerModule.jsx", "src/lib/store.jsx"]) assert.doesNotMatch(read(f), /geochemDiagrams/, f);
});
