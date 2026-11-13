// TASKS.csv #2914 (review #2876, WA iron) — an element answers to its oxide's name: 'Si as SiO2' in the pickers, SiO2 in a formula and as a
// SQL column, presets for Fe2O3 / MnO / P2O5 / SO3 / calcined Fe, and an oxide total built from the project's majors
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import initSqlJs from "sql.js";
import { oxideAliases, elementOptionLabel } from "../src/lib/geochem.js";
import { addCalculatedElement, oxideTotalPreset, CALC_PRESETS, operandsOf } from "../src/lib/calcElement.js";
import { majorOxides } from "../src/lib/oxideTotals.js";
import { buildTables } from "../src/lib/sqlTables.js";

const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} vs ${b}`);
// the review's project: oxides kept as oxides ('% SiO2'), Fe stored as the element, LOI in %
const els = [
  { symbol: "Fe", unit: "%" }, { symbol: "Si", unit: "% SiO2" }, { symbol: "Al", unit: "% Al2O3" }, { symbol: "Ti", unit: "% TiO2" },
  { symbol: "Mn", unit: "%" }, { symbol: "Mg", unit: "% MgO" }, { symbol: "Ca", unit: "% CaO" }, { symbol: "Na", unit: "% Na2O" },
  { symbol: "K", unit: "% K2O" }, { symbol: "P", unit: "%" }, { symbol: "S", unit: "%" }, { symbol: "LOI", unit: "%" }, { symbol: "Cu", unit: "ppm" },
];

test("oxideAliases: a kept oxide reads as itself, an element in % through the import's factor; ppm trace elements get none", () => {
  const al = new Map(oxideAliases(els).map((a) => [a.name, a]));
  assert.equal(al.get("SiO2").symbol, "Si"); near(al.get("SiO2").factor, 1);
  near(al.get("Fe2O3").factor, 1.4297); near(al.get("FeO").factor, 1.2865);
  near(al.get("P2O5").factor, 2.2914); near(al.get("SO3").factor, 2.4971);
  assert.equal(al.has("CuO"), false, "Cu in ppm");
  assert.equal(al.has("LOI"), false);
  // a name an element already has is left to it
  assert.equal(oxideAliases([{ symbol: "Fe", unit: "%" }, { symbol: "Fe2O3", unit: "%" }]).some((a) => a.name === "Fe2O3"), false);
});

test("elementOptionLabel: 'Si as SiO2' for a kept oxide, the bare symbol otherwise", () => {
  assert.equal(elementOptionLabel("Si", "% SiO2"), "Si as SiO2");
  assert.equal(elementOptionLabel("Fe", "%"), "Fe");
  assert.equal(elementOptionLabel("Cu", "ppm"), "Cu");
});

test("a formula with oxide names: SiO2 + Al2O3 and Fe2O3 from Fe, the '<' rule through the alias", () => {
  const assays = [
    { hole_id: "A", from: 0, to: 1, values: { Fe: 60, Si: 5, Al: 2 } },
    { hole_id: "A", from: 1, to: 2, values: { Fe: 30, Si: 40, Al: 6 } },
    { hole_id: "A", from: 2, to: 3, values: { Fe: 50, Al: 3 } },
  ];
  const r = addCalculatedElement(assays, els, "SiAl", "SiO2 + Al2O3", "%");
  assert.equal(r.computed, 2); assert.equal(r.assays[0].values.SiAl, 7); assert.equal(r.assays[1].values.SiAl, 46);
  assert.equal(r.assays[2].values.SiAl, undefined, "no SiO2: no value");
  const f = addCalculatedElement(assays, els, "Fe2O3x", "Fe2O3", "%");
  near(f.assays[0].values.Fe2O3x, 60 * 1.4297);
  assert.deepEqual(operandsOf("SiO2/Al2O3", ["Fe", "Si", "Al"], oxideAliases(els)), ["Si", "Al"]);
  assert.throws(() => addCalculatedElement(assays, els, "X", "CuO + 1"), /Unknown name "CuO"/);
});

test("the new presets compute the oxides and calcined Fe", () => {
  const by = Object.fromEntries(CALC_PRESETS.map((p) => [p.name, p]));
  for (const n of ["Fe2O3", "MnO", "P2O5", "SO3", "CalcFe"]) assert.ok(by[n], n);
  const assays = [{ hole_id: "A", from: 0, to: 1, values: { Fe: 60, LOI: 4 } }];
  const r = addCalculatedElement(assays, els, "CalcFe", by.CalcFe.expr, "%", { readUnits: by.CalcFe.units });
  near(r.assays[0].values.CalcFe, 62.5);
});

test("the oxide total: the majors QAQC > Totals sums, plus LOI, through the aliases", () => {
  const p = oxideTotalPreset(els, { majors: majorOxides(els) });
  assert.equal(p.expr, "SiO2+TiO2+Al2O3+Fe2O3+MnO+MgO+CaO+Na2O+K2O+P2O5+LOI");
  const row = { Fe: 50, Si: 10, Al: 3, Ti: 0.1, Mn: 0.2, Mg: 0.3, Ca: 0.4, Na: 0.05, K: 0.1, P: 0.08, LOI: 5 };
  const r = addCalculatedElement([{ hole_id: "A", from: 0, to: 1, values: row }], els, "OxTotal", p.expr, "%");
  const want = 10 + 0.1 + 3 + 50 * 1.4297 + 0.2 * 1.2912 + 0.3 + 0.4 + 0.05 + 0.1 + 0.08 * 2.2914 + 5;
  near(r.assays[0].values.OxTotal, want, 1e-6);
  // fewer than six majors, or a major not in %: no preset
  assert.equal(oxideTotalPreset(els.slice(0, 3), { majors: majorOxides(els.slice(0, 3)) }), null);
  const ppm = els.map((e) => (e.symbol === "Mg" ? { symbol: "Mg", unit: "ppm" } : e));
  assert.equal(oxideTotalPreset(ppm, { majors: majorOxides(ppm) }), null);
  // without LOI
  const noLoi = els.filter((e) => e.symbol !== "LOI");
  assert.ok(!/LOI/.test(oxideTotalPreset(noLoi, { majors: majorOxides(noLoi) }).expr));
});

test("SQL: the oxide names are columns of assays (virtual, listed in the schema)", async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  const assays = [{ hole_id: "A", from: 0, to: 1, values: { Fe: 60, Si: 5 } }, { hole_id: "A", from: 1, to: 2, values: { Fe: 30, Si: 40 } }];
  const tables = await buildTables(db, { assays, assayElements: [{ symbol: "Fe", unit: "%" }, { symbol: "Si", unit: "% SiO2" }] });
  const cols = tables.find((t) => t.name === "assays").columns;
  for (const c of ["Fe", "Si", "SiO2", "Fe2O3", "FeO"]) assert.ok(cols.includes(c), c);
  assert.deepEqual(db.exec("SELECT AVG(SiO2) FROM assays")[0].values, [[22.5]]);
  near(db.exec("SELECT MAX(Fe2O3) FROM assays")[0].values[0][0], 60 * 1.4297);
  db.close();
});

test("wiring: the pickers name a kept oxide; Calc. element lists the oxide total and says oxide names work", () => {
  const rd = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
  for (const f of ["GradeStatistics", "QAQCPanel", "CorrelationMatrix", "IsoconTool"]) assert.match(rd(`../src/components/${f}.jsx`), /elementOptionLabel\(/, f);
  const g = rd("../src/modules/GeochemModule.jsx");
  assert.match(g, /const presets = oxTotal \? \[\.\.\.CALC_PRESETS, oxTotal\] : CALC_PRESETS;/);
  assert.match(g, /\{presets\.map\(\(p\) => <option key=\{p\.name\}/);
});
