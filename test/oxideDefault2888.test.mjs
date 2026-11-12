// TASKS.csv #2888 (review #2876, WA bedded iron) — an all-oxide iron-ore assay file was stored as elements by default (SiO2 15.0 read
// Si 7.01): only the commodity oxides were kept as reported, seven menus had to be changed one by one, and a second import's choice was
// overridden by the project's unit without a pointer to where it can be changed. Every oxide column is now kept as reported by default
// (Matt's #2487 decision: the basis is set at import from the header), one control switches them all, and the clash line says where.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { keepsOxide, importStoreUnit, convertUnit, valueIn } from "../src/lib/geochem.js";

const IRON = ["SiO2_XRF_pct", "Al2O3_XRF_pct", "CaO_XRF_pct", "MgO_XRF_pct", "K2O_XRF_pct", "Na2O_XRF_pct", "TiO2_XRF_pct"];

test("the iron-ore oxides are kept as reported; the element columns stay elements", () => {
  for (const h of IRON) assert.ok(keepsOxide({ header: h }), h);
  assert.equal(importStoreUnit({ header: "SiO2_XRF_pct", unit: "%" }), "% SiO2");
  assert.equal(importStoreUnit({ header: "Al2O3_XRF_pct", unit: "%" }), "% Al2O3");
  assert.ok(!keepsOxide({ header: "Fe_XRF_pct" })); assert.equal(importStoreUnit({ header: "Fe_XRF_pct", unit: "%" }), "%");
  // as elements on request, as before
  assert.equal(importStoreUnit({ header: "SiO2_XRF_pct", unit: "%", keepOxide: false }), "%");
});

test("kept as SiO2, 15.0 stays 15.0, and a diagram asking for Si % still gets 7.01", () => {
  assert.equal(convertUnit(15, "% SiO2", "% SiO2"), 15);
  assert.ok(Math.abs(valueIn({ values: { Si: 15 } }, "Si", "%", { Si: "% SiO2" }) - 7.012) < 0.001);
});

test("one control switches every oxide column; the clash line says where the basis is changed", () => {
  const m = readFileSync(new URL("../src/components/AssayImportModal.jsx", import.meta.url), "utf8");
  assert.match(m, /const setAllOxide = \(keep\) => onChange\(\{ \.\.\.modal, elements: modal\.elements\.map\(\(e\) => \(oxideOfHeader\(e\.header\) \? \{ \.\.\.e, keepOxide: keep \} : e\)\) \}\);/);
  assert.match(m, /onClick=\{\(\) => setAllOxide\(true\)\}[^}]*\}[^>]*>\{tr\("All as reported \(oxides\)"\)\}/);
  assert.match(m, /onClick=\{\(\) => setAllOxide\(false\)\}[^}]*\}[^>]*>\{tr\("All as elements"\)\}/);
  assert.match(m, /unitClashes\.some\(\(e\) => oxideOfHeader\(e\.header\)\) && " " \+ tr\("To store an element as its oxide/);
  for (const l of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"));
    for (const k of ["All as reported (oxides)", "All as elements", "To store an element as its oxide (or as the element) in this project, change its basis in Geochem under Imported files & elements: the assays already in the project are converted with it."]) assert.ok(d[k], `${l}: ${k}`);
  }
});
