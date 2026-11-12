// TASKS.csv #2957 (WA iron review) — a rock-chip file on a project whose drill assays hold SiO2 / Al2O3 as oxides was stored as Si / Al
// (16.02 % SiO2 labelled 7.49), and its LOI column was kept as text
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { projectKeepsOxide, keepsOxide, importStoreUnit, pickElementColumns, LOI } from "../src/lib/geochem.js";

test("projectKeepsOxide: the basis the project already stores; nothing when the project does not hold the element", () => {
  const units = { Si: "% SiO2", Al: "% Al2O3", Fe: "%", Li: "%" };
  const si = { symbol: "Si", header: "SiO2_pct", unit: "%" }, fe = { symbol: "Fe", header: "Fe2O3_pct", unit: "%" }, li = { symbol: "Li", header: "Li2O_pct", unit: "%" }, mg = { symbol: "Mg", header: "MgO_pct", unit: "%" };
  assert.deepEqual(projectKeepsOxide(si, units), { keepOxide: true });
  assert.deepEqual(projectKeepsOxide(fe, units), { keepOxide: false }, "the project stores Fe as the element");
  assert.deepEqual(projectKeepsOxide(li, units), { keepOxide: false }, "a commodity oxide follows the project too");
  assert.deepEqual(projectKeepsOxide(mg, units), {}, "not in the project: the header's default");
  assert.deepEqual(projectKeepsOxide({ symbol: "Cu", header: "Cu_ppm" }, units), {}, "not an oxide column");
  // what the import then stores
  assert.equal(importStoreUnit({ ...si, ...projectKeepsOxide(si, units) }), "% SiO2");
  assert.equal(keepsOxide(si), false, "without the project, a major oxide is stored as the element (as before)");
});

test("an LOI column on a rock-chip file is offered as LOI (the drill route, #2734)", () => {
  const els = pickElementColumns(["Fe_pct", "SiO2_pct", "LOI_pct"], [{ Fe_pct: "58", SiO2_pct: "16.02", LOI_pct: "8.2" }, { Fe_pct: "60", SiO2_pct: "4", LOI_pct: "" }]);
  assert.equal(els.find((e) => e.symbol === LOI)?.header, "LOI_pct");
});

test("wiring: both surface dialogs take the project's basis; the surface commit reads LOI by its own rule", () => {
  const g = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
  assert.equal((g.match(/checked: e\.n > 0, \.\.\.projectKeepsOxide\(e, projectUnits\)/g) || []).length, 2);
  assert.match(g, /const projectUnits = useMemo\(\(\) => \(\{ \.\.\.Object\.fromEntries\(assayElements/);
  assert.match(g, /const c = e\.symbol === LOI \? readLoiCell\(r\[e\.header\]\)/);
  // the notice names a kept oxide column as kept (it listed every oxide column as converted to the element)
  assert.match(g, /const surfKept = surfOxAll\.filter\(\(\{ e, ox \}\) => unitBasis\(existingUnit\[e\.symbol\] \|\| importStoreUnit\(e\)\)\.oxide === ox\.oxide\);/);
  assert.match(g, /tr\("Oxide columns kept as the oxide, as the project stores them: \{list\}\."/);
});
