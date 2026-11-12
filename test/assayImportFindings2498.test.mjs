// TASKS.csv #2498 — the assay import notice says what it met: below-detection cells and limits, values over 100 %, numeric columns left
// out, sample types that are not drill intervals
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assayImportFindings } from "../src/lib/assayImportFindings.js";

const rows = [
  { hole_id: "RC621", from: 8, to: 9, values: { Li: 0.0025, Fe: 110.917 }, qualifiers: { Li: "<" } },
  { hole_id: "RC621", from: 9, to: 10, values: { Li: 0.0025, Fe: 12 }, qualifiers: { Li: "<" } },
  { hole_id: "RC622", from: 0, to: 1, values: { Li: 0.0005, Fe: 101 }, qualifiers: { Li: "<" } },
  { hole_id: "RC622", from: 1, to: 2, values: { Li: 1.2, Fe: 5 }, sample_type: "GRAB" },
  { hole_id: "RC622", from: 2, to: 3, values: { Li: 0.9, Fe: 5 }, sample_type: "RC" },
];
const elements = [{ symbol: "Li", header: "Li_pct", unit: "%" }, { symbol: "Fe", header: "Fe2O3_pct", unit: "%" }];
const headers = ["Hole", "From", "To", "Li_pct", "Fe2O3_pct", "total_pct", "Lab", "LOI_pct"];
const allRows = [{ Hole: "RC621", From: 8, To: 9, Li_pct: "<0.005", Fe2O3_pct: "110.917", total_pct: "133.7", Lab: "ALS", LOI_pct: "3.2" }, { Hole: "RC622", From: 1, To: 2, Li_pct: "0.8", Fe2O3_pct: "101.2", total_pct: "104", Lab: "ALS", LOI_pct: "1" }];
const at = (r) => `${r.Hole} ${r.From}-${r.To} m`;

test("below detection per element with the commonest limit; values over 100 % with the worst; columns left out; non-drill types", () => {
  const f = assayImportFindings({ rows, elements, unitOf: () => "%", headers, used: ["Hole", "From", "To"], allRows, at });
  assert.deepEqual(f.below, [{ symbol: "Li", n: 3, limit: 0.005, unit: "%" }]);
  // from the file's column, so an oxide stored as its element (Fe2O3 110.9 % -> Fe 77.6 %) is still caught
  assert.deepEqual(f.over100, [{ symbol: "Fe2O3_pct", n: 2, max: 111, where: "RC621 8-9 m" }]);
  assert.deepEqual(f.notImported, ["total_pct"], "Lab is text; LOI has its own line");
  assert.deepEqual(f.nonDrill, [["GRAB", 1]]);
});

test("nothing to say: empty lists", () => {
  const f = assayImportFindings({ rows: [rows[4]], elements, unitOf: () => "ppm", headers: ["Hole"], used: ["Hole"], allRows: [] });
  assert.deepEqual(f, { below: [], over100: [], notImported: [], nonDrill: [] });
});

test("wired into the commit notice", () => {
  const g = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
  assert.match(g, /const f = assayImportFindings\(\{ rows, elements: chosen,/);
  for (const k of ["Values over 100 % (a total or a unit to check in the file): {list}.", "Not imported (numeric, not an element): {cols}.", "Sample types that are not drill intervals, taken in as rows of their hole: {list}."]) assert.ok(g.includes(`tr(${JSON.stringify(k)}`), k);
});
