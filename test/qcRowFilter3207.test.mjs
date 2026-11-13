// TASKS.csv #3207 (#3195, Galore Creek) — a specific-gravity table's QC standards (most at a dummy 999-1,000 m or 9,999-10,000 m) came in as rock density
// unless the row filter was found; a 'Rejected?' column was not read as a reject flag. The row filter is pre-set for both (never on an assay import,
// where QC samples are kept for QAQC), and the import notice counts rows past the end of their hole. Synthetic data only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rowFilterColumns, qcRowFilter, flagRowFilter, defaultRowFilter, applyRowFilter } from "../src/lib/importRowFilter.js";
import { importCheckSummary } from "../src/lib/dataQC.js";

const headers = ["Hole", "From", "To", "SG Sample Type", "CALC-SG", "Rejected?"];
const rows = [
  ...Array.from({ length: 20 }, (_, i) => ({ Hole: "H1", From: String(i * 5), To: String(i * 5 + 0.2), "SG Sample Type": "Original", "CALC-SG": String(2.6 + (i % 4) / 20), "Rejected?": i === 3 ? "Y" : "N" })),
  ...Array.from({ length: 4 }, () => ({ Hole: "H1", From: "999", To: "1000", "SG Sample Type": "Standard", "CALC-SG": "2.70", "Rejected?": "N" })),
  { Hole: "H1", From: "9999", To: "10000", "SG Sample Type": "Standard", "CALC-SG": "2.70", "Rejected?": "N" },
  { Hole: "H1", From: "40", To: "40.2", "SG Sample Type": "Field Duplicate", "CALC-SG": "2.64", "Rejected?": "N" },
];

test("a QC sample-type column is pre-set to keep the rock samples; on an assay import it is not", () => {
  const cols = rowFilterColumns(headers, rows);
  assert.deepEqual(qcRowFilter(cols), { col: "SG Sample Type", keep: ["Original"], drop: 6, flag: "qc" });
  const f = defaultRowFilter(headers, rows);
  assert.equal(f.flag, "qc");
  assert.equal(applyRowFilter(rows, f).dropped, 6);
  assert.notEqual(defaultRowFilter(headers, rows, { qc: false })?.flag, "qc", "an assay import keeps its QC samples");
  for (const v of ["STD", "CRM", "Blank", "BLK", "Dup", "Pulp Duplicate", "Coarse Rep", "Lab Repeat", "Check"]) assert.equal(qcRowFilter([{ col: "QC_Type", values: [["Sample", 10], [v, 2]] }])?.drop, 2, v);
  assert.equal(qcRowFilter([{ col: "Lithology", values: [["Standard", 3], ["Basalt", 9]] }]), null, "a column not named for sample type");
});

test("'Rejected?' is a reject flag (the trailing ? no longer hides it)", () => {
  const f = flagRowFilter(rowFilterColumns(["Hole", "Rejected?"], rows.map((r) => ({ Hole: r.Hole, "Rejected?": r["Rejected?"] }))));
  assert.deepEqual(f, { col: "Rejected?", keep: ["N"], drop: 1, flag: "superseded" });
});

test("the import notice counts rows past the end of their hole (a standard at 999-1,000 m in a 120 m hole)", () => {
  const sgRows = rows.map((r) => ({ hole_id: r.Hole, from: Number(r.From), to: Number(r.To), value: Number(r["CALC-SG"]) }));
  const msg = importCheckSummary(sgRows, [{ hole_id: "H1", length: 120 }], [], "Specific gravity rows from sg.csv", { min: 1, max: 6 });
  assert.match(String(msg?.text ?? msg), /5 past the end of their hole \(its length from the collar file\)/);
});

test("the dialogs use the preset; the assay dialog's box never offers the QC one", () => {
  assert.match(readFileSync(new URL("../src/components/AssayImportModal.jsx", import.meta.url), "utf8"), /<RowFilterBox modal=\{modal\} onChange=\{onChange\} sel=\{sel\} qc=\{false/);
  assert.match(readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8"), /modalIn\.allRows, \{ qc: false/);
  assert.match(readFileSync(new URL("../src/modules/viewer/useImportPipeline.js", import.meta.url), "utf8"), /allRowsIn, \{ qc: target !== "assays" \}\)/);
});
