// TASKS.csv #2943 (split from #2734) — a long-format assay file's LOI analyte was skipped as "not an element"; it is now the LOI field, as in a
// wide file. Found on the way: an oxide analyte (SiO2) became the column Si_pct, so 55 % SiO2 was read as 55 % silicon. Synthetic data only.
import test from "node:test";
import assert from "node:assert/strict";
import { pivotLongAssays } from "../src/lib/longAssays.js";
import { isElementColumn, inferUnit, pickElementColumns, importStoreUnit, LOI } from "../src/lib/geochem.js";

const headers = ["hole_id", "from", "to", "sample_id", "analyte", "units", "concentration"];
const rowsOf = (list) => list.flatMap(([s, f, analytes]) => analytes.map(([analyte, units, concentration]) => ({ hole_id: "H1", from: f, to: f + 1, sample_id: s, analyte, units, concentration })));
const pivot = (rows) => pivotLongAssays(rows, headers, (sym) => inferUnit(sym, sym), (a) => isElementColumn(a));

test("an LOI analyte becomes the LOI field in weight per cent; several are kept apart and the wide rule picks the main one", () => {
  const rows = rowsOf([["S1", 0, [["LOI", "%", 3.2], ["LOI 1000", "%", 3.5], ["Au", "ppm", 0.1], ["Moisture", "%", 1]]], ["S2", 1, [["LOI", "%", 4.1], ["LOI 1000", "%", 4.4], ["Au", "ppm", 0.2], ["Moisture", "%", 2]]]]);
  const pv = pivot(rows);
  assert.deepEqual(pv.headers.slice(4), ["LOI_pct", "LOI_1000_pct", "Au_ppm"]);
  assert.deepEqual(pv.rows.map((r) => [r.LOI_pct, r.LOI_1000_pct]), [[3.2, 3.5], [4.1, 4.4]]);
  assert.equal(pv.report.unknownAnalyte, 2, "Moisture is still not an element");
  const loi = pickElementColumns(pv.headers, pv.rows).find((e) => e.symbol === LOI);
  assert.deepEqual(loi && { header: loi.header, unit: loi.unit, alts: loi.alts }, { header: "LOI_1000_pct", unit: "%", alts: ["LOI_pct"] });
});

test("LOI with no units column is still read in per cent", () => {
  const rows = rowsOf([["S1", 0, [["LOI", "", 2.5], ["Cu", "", 120]]]]).map(({ units, ...r }) => r);
  const pv = pivotLongAssays(rows, headers.filter((h) => h !== "units"), (sym) => inferUnit(sym, sym), (a) => isElementColumn(a));
  assert.deepEqual(pv.headers.slice(4), ["LOI_pct", "Cu_ppm"]);
});

test("an oxide analyte keeps its oxide name, so SiO2 55 % is read as the oxide, not as 55 % silicon", () => {
  const rows = rowsOf([["S1", 0, [["SiO2", "%", 55], ["Fe2O3T", "%", 8.1], ["Cu", "ppm", 40]]]]);
  const pv = pivot(rows);
  assert.deepEqual(pv.headers.slice(4), ["SiO2_pct", "Fe2O3T_pct", "Cu_ppm"]);
  const els = pickElementColumns(pv.headers, pv.rows);
  const si = els.find((e) => e.symbol === "Si"), fe = els.find((e) => e.symbol === "Fe");
  assert.equal(si.header, "SiO2_pct");
  assert.equal(importStoreUnit(si), "% SiO2"); // kept as the oxide, as a wide SiO2_pct column is
  assert.equal(fe.header, "Fe2O3T_pct");
});
