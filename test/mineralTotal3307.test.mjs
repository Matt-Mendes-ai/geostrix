// TASKS.csv #3307 (High, Matt 2026-11-13) — a logging database's mineral-assemblage table (py_sum, py_dist, py_morph, sph_sum, po_sum, cpy_sum, gal_sum,
// apy_sum, sfs_sum, au_sum …) imported as Mineralization stayed disabled ("Value: no column matched"), and a layer with numbers as its codes showed
// a legend row per number. "Mineralization should be categorized as minerals"; "field Value should be Total Min". Synthetic table of that shape.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { isSumMineralColumn, mineralCode, companionColumns, perMineralOffer, mineralPlan, singleMineralRows, MIN_CODE_COL, MIN_TOTAL_COL } from "../src/lib/perMineralColumns.js";
import { guessMapping } from "../src/lib/layers.js";
import { codeColumnGuess } from "../src/lib/valueGuess.js";
import { normInterval } from "../src/lib/viewer/importHelpers.js";

const H = ["hole_id", "from_m", "to_m", "py_sum", "py_dist", "py_morph", "sph_sum", "sph_dist", "po_sum", "cpy_sum", "gal_sum", "apy_sum", "sfs_sum", "au_sum", "logged_by", "comments"];
const amounts = [
  { py_sum: "3", sph_sum: "0.5", po_sum: "", cpy_sum: "0.2" }, // PY dominant, total 3.7
  { py_sum: "0.5", sph_sum: "2", po_sum: "1", cpy_sum: "" }, // SPH, 3.5
  { py_sum: "", sph_sum: "", po_sum: "", cpy_sum: "" }, // none logged
  { py_sum: "1", sph_sum: "", po_sum: "", cpy_sum: "", au_sum: "1" }, // a tie: the first column wins (PY), 2
];
const rows = Array.from({ length: 24 }, (_, i) => ({ hole_id: "SY-" + (i % 3), from_m: String(i * 2), to_m: String(i * 2 + 2), py_dist: "diss", py_morph: "cubic", sph_dist: "", gal_sum: "", apy_sum: i % 6 ? "" : "0.1", sfs_sum: "", au_sum: "", logged_by: "AB", comments: "note " + i, ...amounts[i % 4] }));

test("the mineral amount columns are recognized, with their text companions", () => {
  for (const h of ["py_sum", "sph_sum", "po_sum", "cpy_sum", "gal_sum", "apy_sum", "sfs_sum", "au_sum", "MN_CPY_sum"]) assert.ok(isSumMineralColumn(h, H), h);
  for (const h of ["meter_sum", "qtz_vn_sum", "sample_sum", "hole_id"]) assert.ok(!isSumMineralColumn(h, H), h);
  assert.ok(isSumMineralColumn("xyz_sum", ["xyz_sum", "xyz_dist"]), "an unknown stem with a _dist companion is a mineral too");
  assert.deepEqual(companionColumns("py_sum", H), ["py_dist", "py_morph"]);
  assert.equal(mineralCode("py_sum"), "PY"); assert.equal(mineralCode("MN_CPY_pct"), "CPY"); assert.equal(mineralCode("sfs_sum"), "SFS");
});

test("Mineralization with no code column is offered as minerals, the one layer by default; Value is not needed", () => {
  const m0 = guessMapping("mnlgy", H);
  assert.ok(!m0.value, "no code column (the reported 'Value: no column matched')");
  const guess = codeColumnGuess("mnlgy", H, rows, m0), mapping = guess ? { ...m0, value: guess.col } : m0;
  const offer = perMineralOffer("mnlgy", H, rows, mapping);
  assert.ok(offer, "offered even with a companion (py_dist …) guessed as the Value");
  assert.deepEqual(offer.filter((c) => c.n).map((c) => c.col), ["py_sum", "sph_sum", "po_sum", "cpy_sum", "apy_sum", "au_sum"]);
  const plan = mineralPlan("mnlgy", H, rows, mapping, { target: "mnlgy" });
  assert.equal(plan.mode, "single"); assert.equal(plan.colourBy, "dominant");
  assert.deepEqual(plan.blank, ["gal_sum", "sfs_sum"]);
  assert.equal(mineralPlan("mnlgy", H, rows, mapping, { mineralMode: "layers" }).mode, "layers", "#3205's per-mineral layers stay a choice");
});

test("each interval: its dominant mineral as the code, Total min as the value, every mineral and its companions as fields", () => {
  const mapping = { hole_id: "hole_id", from: "from_m", to: "to_m" };
  const plan = mineralPlan("mnlgy", H, rows, mapping, { target: "mnlgy" });
  const out = singleMineralRows(rows, mapping, plan);
  assert.equal(out.rows.length, 20); assert.equal(out.none, 4, "the intervals with none logged are not in the layer (two of the six blank rows carry apy 0.1)");
  assert.deepEqual(out.mapping, { ...mapping, value: MIN_CODE_COL, extra: MIN_TOTAL_COL });
  const built = out.rows.map((r) => normInterval(r, out.mapping, out.customFields));
  assert.deepEqual([built[0].value, built[0].extra], ["PY", 3.8], "3 + 0.5 + 0.2 + 0.1 (apy on this row)");
  assert.deepEqual([built[1].value, built[1].extra], ["SPH", 3.5]);
  assert.deepEqual([built[2].value, built[2].extra], ["PY", 2], "a tie: the first column");
  assert.equal(built[0].py_sum, 3); assert.equal(built[0].py_dist, "diss"); assert.equal(built[0].py_morph, "cubic"); assert.equal(built[0].po_sum, null);
  assert.ok(!("logged_by" in built[0]), "other columns are not made fields here");
  // the legend: one row per mineral, never per number
  assert.deepEqual([...new Set(built.map((r) => r.value))].sort(), ["APY", "PY", "SPH"]); // APY: the two rows with only arsenopyrite
  // coloured by a chosen mineral
  const bySph = singleMineralRows(rows, mapping, plan, "sph_sum").rows.map((r) => r[MIN_CODE_COL]);
  assert.deepEqual([...new Set(bySph)].sort(), ["No SPH", "SPH"]);
});

test("wired: before the commit, for the dialog, a queued drop and a database reload; the database keeps the dialog's choices", () => {
  const u = fs.readFileSync(new URL("../src/modules/viewer/importPipelineImpl.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(u, /const commitImportData = \(data\) => \{\n {4}const plan = data\?\.target === "mnlgy" && perMineralLib/);
  assert.match(u, /return commitImportDataRaw\(\{ \.\.\.data, allRows: out\.rows, mapping: out\.mapping, customFields: \[\.\.\.own, \.\.\.out\.customFields\], recordAs: data \}\);/);
  assert.match(u, /dbImportRecord\(data\.recordAs \|\| data/);
  assert.match(u, /for \(const rec of recs\) await loadPerMineral\(rec\.target\);/);
  const b = fs.readFileSync(new URL("../src/components/MineralPercentBox.jsx", import.meta.url), "utf8");
  assert.match(b, /name="mineralMode" checked=\{single\}/);
  const d = fs.readFileSync(new URL("../src/components/ImportMappingModal.jsx", import.meta.url), "utf8");
  assert.match(d, /modal\.target === "mnlgy" && numericCodes\(/, "numbers chosen as mineral codes are warned of");
});
