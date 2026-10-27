// TASKS.csv #1016 — the Assays CSV export re-imports as it was: units in the headers, < / > qualifiers, QC columns
import test from "node:test";
import assert from "node:assert/strict";
import Papa from "papaparse";
import { assayExportRows, pickElementColumns, readAssayCell } from "../src/lib/geochem.js";

const elements = [{ symbol: "Au", unit: "ppb" }, { symbol: "Cu", unit: "%" }, { symbol: "Ag", unit: "ppm" }];
const assays = [
  { hole_id: "DH-1", from: 0, to: 1.5, sample_id: "S001", values: { Au: 12, Cu: 0.45, Ag: 1.2 } },
  { hole_id: "DH-1", from: 1.5, to: 3, sample_id: "S002", values: { Au: 2.5, Cu: 10, Ag: 0.25 }, qualifiers: { Au: "<", Cu: ">", Ag: "<" } },
  { hole_id: "DH-1", from: 3, to: 3, sample_id: "S003", sample_type: "standard", qc_code: "CDN-GS-1", values: { Au: 683 } },
];

test("#1016 headers carry the unit, qualifiers are written as the lab writes them, QC columns are kept", () => {
  const rows = assayExportRows(assays, elements);
  assert.deepEqual(Object.keys(rows[0]), ["hole_id", "from", "to", "sample_id", "sample_type", "parent_id", "qc_code", "source", "Au_ppb", "Cu_pct", "Ag_ppm"]);
  assert.deepEqual([rows[1].Au_ppb, rows[1].Cu_pct, rows[1].Ag_ppm], ["<5", ">10", "<0.5"]);
  assert.equal(rows[2].sample_type, "standard"); assert.equal(rows[2].qc_code, "CDN-GS-1"); assert.equal(rows[2].Cu_pct, "");
});

test("#1016 the file read back by the assay importer's own column picker gives the same units and values", () => {
  const csv = Papa.unparse(assayExportRows(assays, elements));
  const { data, meta } = Papa.parse(csv, { header: true, skipEmptyLines: true });
  const cols = pickElementColumns(meta.fields, data);
  const by = Object.fromEntries(cols.map((c) => [c.symbol, c]));
  assert.deepEqual([by.Au.unit, by.Cu.unit, by.Ag.unit], ["ppb", "%", "ppm"]);
  const au = readAssayCell(data[1][by.Au.header]), cu = readAssayCell(data[1][by.Cu.header]);
  assert.deepEqual([au.value, au.qualifier], [2.5, "<"]); // half the limit again, flagged
  assert.deepEqual([cu.value, cu.qualifier], [10, ">"]);
  assert.equal(readAssayCell(data[0][by.Au.header]).value, 12);
});
