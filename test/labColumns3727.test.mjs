// TASKS.csv #3727 (Scottie Gold review) — '+ Add CSV layer' on an assay workbook pre-ticked nine lab element columns (al_pct … ti_pct) as 'Minerals
// in this file' and stored the assays as nine '% visual' layers. Lab element columns are not minerals; the dialog says what it left out.
// Synthetic headers only (the review's data never enters the repo).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { perMineralOffer, isAssayTable, isLabElementColumn, labColumnsLeftOut, mineralPlan } from "../src/lib/perMineralColumns.js";

const rowsOf = (headers, n = 12, hole = "hole_id") => Array.from({ length: n }, (_, i) => Object.fromEntries(headers.map((h) => [h, h === hole ? "SG-1" : h === "from" ? String(i) : h === "to" ? String(i + 1) : /zone|target|style/i.test(h) ? "Z1" : String(1 + (i % 4))])));
const m = { hole_id: "hole_id", from: "from", to: "to" };

test("an assay workbook: no mineral offer, and its element columns are named as left out", () => {
  const h = ["hole_id", "from", "to", "sample", "au_ppm", "ag_ppm", "cu_ppm", "as_ppm", "al_pct", "ca_pct", "fe_pct", "k_pct", "mg_pct", "na_pct", "s_pct", "ti_pct", "p_pct", "Zone", "Target"];
  const rows = rowsOf(h);
  assert.equal(isAssayTable(h), true);
  for (const target of ["custom", "mnlgy", "litho"]) assert.equal(perMineralOffer(target, h, rows, m), null, target);
  assert.equal(mineralPlan("custom", h, rows, m, {}), null, "the import is the value column, not nine '% visual' layers");
  const left = labColumnsLeftOut("custom", h, m);
  assert.deepEqual(left.cols, ["al_pct", "ca_pct", "fe_pct", "k_pct", "mg_pct", "na_pct", "s_pct", "ti_pct", "p_pct"]);
  assert.equal(left.assay, true);
  // a whole-rock oxide table sums to ~100 per row: not a composition log either
  const ox = ["hole_id", "from", "to", "SiO2_pct", "Al2O3_pct", "Fe2O3_pct", "CaO_pct", "MgO_pct"];
  const oxRows = rowsOf(ox).map((r) => ({ ...r, SiO2_pct: "60", Al2O3_pct: "15", Fe2O3_pct: "10", CaO_pct: "10", MgO_pct: "5" }));
  assert.equal(perMineralOffer("litho", ox, oxRows, m), null);
  assert.equal(perMineralOffer("custom", ox, oxRows, m), null);
});

test("mineral logs still get the box: prefixed, plain abbreviations, _sum columns, a composition", () => {
  const log = ["hole_id", "from", "to", "MN_CPY_pct", "MN_PY_pct", "MN_MO_pct", "MN_CPY_style"];
  const offer = perMineralOffer("custom", log, rowsOf(log), m);
  assert.deepEqual(offer.map((c) => c.col), ["MN_CPY_pct", "MN_PY_pct", "MN_MO_pct"], "MN_ is the mineralization prefix, not manganese");
  assert.equal(labColumnsLeftOut("custom", log, m), null);
  const plain = ["hole_id", "from", "to", "py_pct", "po_pct", "cpy_pct", "Mo_pct", "Au_pct"]; // Po / Mo / Au are elements, and logging abbreviations
  assert.deepEqual(perMineralOffer("custom", plain, rowsOf(plain), m).map((c) => c.col), ["py_pct", "po_pct", "cpy_pct", "Mo_pct", "Au_pct"]);
  const sums = ["hole_id", "from", "to", "py_sum", "sph_sum", "au_sum", "py_dist"];
  assert.deepEqual(perMineralOffer("mnlgy", sums, rowsOf(sums), m).map((c) => c.col), ["py_sum", "sph_sum", "au_sum"]);
  const comp = ["hole_id", "from", "to", "Met_HEM_pct", "Met_GOE_pct", "Met_CLAY_pct"];
  const compRows = rowsOf(comp).map((r) => ({ ...r, Met_HEM_pct: "50", Met_GOE_pct: "30", Met_CLAY_pct: "20" }));
  assert.ok(perMineralOffer("litho", comp, compRows, m).composition, "the WA material-type log is still a composition");
});

test("a mineral log with one lab column beside it: the minerals are offered, the lab column is left out and said", () => {
  const h = ["hole_id", "from", "to", "MN_CPY_pct", "MN_PY_pct", "Fe_pct"];
  const offer = perMineralOffer("custom", h, rowsOf(h), m);
  assert.deepEqual(offer.map((c) => c.col), ["MN_CPY_pct", "MN_PY_pct"]);
  assert.deepEqual(labColumnsLeftOut("custom", h, m), { cols: ["Fe_pct"], assay: false });
});

test("which names are lab elements", () => {
  const assay = ["au_ppm", "cu_ppm", "zn_ppm"];
  for (const h of ["fe_pct", "Fe (%)", "S%", "Cu%", "Mn_pct", "Fe2O3_pct", "SiO2 (%)"]) assert.equal(isLabElementColumn(h, []), true, h);
  for (const h of ["MN_CPY_pct", "py_pct", "po_pct", "Mo_pct", "Au_pct", "py_sum", "au_sum", "Fe_ICP_pct", "hole_id"]) assert.equal(isLabElementColumn(h, []), false, h);
  for (const h of ["Mo_pct", "Au_pct", "au_sum", "Fe_ICP_pct", "Ga_pct"]) assert.equal(isLabElementColumn(h, assay), true, `${h} in an assay table`);
  for (const h of ["MN_CPY_pct", "py_pct", "po_pct"]) assert.equal(isLabElementColumn(h, assay), false, `${h} stays a mineral`);
  assert.equal(isAssayTable(["au_ppm", "ag_ppm"]), false, "two element columns are not yet an assay table");
  assert.equal(isAssayTable(["Au_ppm_FA", "Cu_ICP_ppm", "Ag (ppm)"]), true, "method codes and bracketed units");
});

test("wiring: the box says what it left out, in the four languages", () => {
  const box = readFileSync(new URL("../src/components/MineralPercentBox.jsx", import.meta.url), "utf8");
  assert.match(box, /labColumnsLeftOut\(modal\.target, modal\.headers, modal\.mapping \|\| \{\}\)/);
  assert.match(box, /if \(!cols\) return labNote \? <div role="note"/);
  for (const l of ["es", "pt", "fr", "ar"]) {
    const j = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"));
    assert.ok(j["Left out as lab element results, not minerals: {cols}."], l);
  }
});
