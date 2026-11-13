// TASKS.csv #3129 — GTK's whole-rock table has C_pct; the assay import did not take it as an element, so total carbon was dropped. Carbon and
// nitrogen are read when their unit follows the symbol; a bare C or N column (a code) and qualified carbons (organic, graphitic) stay columns.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isElementColumn, pickElementColumns, inferUnit, UNIT_ONLY_SYMBOLS, ELEMENT_SYMBOLS } from "../src/lib/geochem.js";

test("C and N with their unit right after the symbol are elements", () => {
  for (const [h, s] of [["C_pct", "C"], ["C-ppm", "C"], ["C (%)", "C"], ["C_wt%", "C"], ["c_pct", "C"], ["N_ppm", "N"], ["N (ppm)", "N"], ["CPCT", "C"], ["NPPM", "N"]]) assert.equal(isElementColumn(h), s, h);
  assert.equal(inferUnit("C_pct", "C"), "%");
  assert.equal(inferUnit("N_ppm", "N"), "ppm");
});

test("a bare C or N, a qualified carbon, CO2 and the unit further on stay ordinary columns", () => {
  for (const h of ["C", "N", "Ccode", "C_code", "C_org_pct", "Corg_pct", "TOC_pct", "C_graphitic_pct", "C_LECO_pct", "CO2_pct", "CO3_pct", "NO3_ppm", "C_pct_dup"]) assert.equal(isElementColumn(h), false, h);
  assert.ok(!ELEMENT_SYMBOLS.includes("C") && UNIT_ONLY_SYMBOLS.includes("C"), "C is not a plain symbol: a column named C stays a code");
});

test("the assay import takes C_pct as carbon in %, beside a code column named C", () => {
  const rows = [{ C_pct: "0.12", C: "A", S_pct: "1.4", SiO2_pct: "55" }, { C_pct: "<0.05", C: "B", S_pct: "0.2", SiO2_pct: "61" }, { C_pct: "2.3", C: "A", S_pct: "", SiO2_pct: "48" }];
  const els = pickElementColumns(["C", "C_pct", "S_pct", "SiO2_pct"], rows);
  const c = els.find((e) => e.symbol === "C");
  assert.deepEqual(c && { header: c.header, unit: c.unit, n: c.n }, { header: "C_pct", unit: "%", n: 3 });
  assert.deepEqual(els.map((e) => e.symbol).sort(), ["C", "S", "Si"]);
});

test("the import dialogs offer C and N when an element is picked by hand", () => {
  for (const f of ["AssayImportModal", "SurfaceImportModal"]) assert.match(readFileSync(new URL(`../src/components/${f}.jsx`, import.meta.url), "utf8"), /\[\.\.\.ELEMENT_SYMBOLS, \.\.\.UNIT_ONLY_SYMBOLS/, f);
});
