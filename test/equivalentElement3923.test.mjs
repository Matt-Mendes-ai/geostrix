// TASKS.csv #3923 (user feedback: gold equivalent, silver equivalent ...) — the Calculated element panel's metal equivalent: prices and recoveries TYPED for every metal (nothing
// filled in), written as a linear formula that agrees with Best intercepts' own equivalent, stored with its inputs. SYNTHETIC grades and prices.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { equivalentFromInputs, suggestedBase } from "../src/lib/equivalentElement.js";
import { addCalculatedElement } from "../src/lib/calcElement.js";
import { withMetalEquivalent } from "../src/lib/geochem.js";

const elements = [{ symbol: "Au", unit: "ppm" }, { symbol: "Ag", unit: "ppm" }, { symbol: "Cu", unit: "%" }, { symbol: "Zn", unit: "ppm" }, { symbol: "CuAu", unit: "index", calculated: { expr: "Cu/Au" } }];
const units = Object.fromEntries(elements.map((e) => [e.symbol, e.unit]));
const eq = (rows, base = "Au") => ({ base, rows });
const typed = eq({ Au: { price: "2000", recovery: "90" }, Ag: { on: true, price: "25", recovery: "80" }, Cu: { on: true, price: "4", recovery: "85" } });
const assays = [
  { hole_id: "DH-23-001", from: 0, to: 2, values: { Au: 1.2, Ag: 30, Cu: 0.45 }, qualifiers: {} },
  { hole_id: "DH-23-001", from: 2, to: 4, values: { Au: 0.3, Ag: 8, Cu: 0.1 }, qualifiers: {} },
  { hole_id: "DH-23-001", from: 4, to: 6, values: { Au: 0.5, Ag: 4 }, qualifiers: {} },
];

test("#3923 nothing is filled in: no price or recovery, no equivalent", () => {
  assert.deepEqual(equivalentFromInputs(eq({}), elements), { ready: false, problem: "others" });
  assert.deepEqual(equivalentFromInputs(eq({ Ag: { on: true } }), elements), { ready: false, problem: "inputs" });
  assert.equal(equivalentFromInputs(eq({ Au: { price: "2000", recovery: "90" }, Ag: { on: true, price: "25" } }), elements).problem, "inputs", "a recovery missing");
  assert.equal(equivalentFromInputs(eq({ Au: { price: "2000", recovery: "150" }, Ag: { on: true, price: "25", recovery: "80" } }), elements).problem, "inputs", "a recovery over 100 %");
  assert.equal(equivalentFromInputs({ base: "", rows: {} }, elements).problem, "base");
  assert.equal(equivalentFromInputs(eq({ CuAu: { on: true, price: "1", recovery: "50" } }), elements).problem, "others", "a calculated element is not a metal to price");
});

test("#3923 the formula agrees with Best intercepts' equivalent, sample by sample, with each metal read in its stored unit", () => {
  const d = equivalentFromInputs(typed, elements);
  assert.equal(d.ready, true);
  assert.equal(d.name, "AuEq"); assert.equal(d.unit, "ppm");
  assert.match(d.expr, /^Au\+Ag\*[0-9.e-]+\+Cu\*[0-9.e-]+$/);
  const metals = [{ symbol: "Au", unit: "ppm", price: 2000, recovery: 0.9 }, { symbol: "Ag", unit: "ppm", price: 25, recovery: 0.8 }, { symbol: "Cu", unit: "%", price: 4, recovery: 0.85 }];
  const reference = withMetalEquivalent(assays, metals, units).rows;
  const r = addCalculatedElement(assays, elements.filter((e) => !e.calculated), d.name, d.expr, d.unit);
  for (const i of [0, 1]) assert.ok(Math.abs(r.assays[i].values.AuEq - reference[i].values.AuEq) < 1e-6 * Math.max(1, reference[i].values.AuEq), `${i}: ${r.assays[i].values.AuEq} vs ${reference[i].values.AuEq}`);
  assert.equal(r.assays[2].values.AuEq, undefined, "a sample missing a metal has no equivalent (Best intercepts leaves it out too)");
  assert.equal(reference[2].values.AuEq, null);
  // a hand check of the first sample: Ag 30 ppm = 30 g/t at $25/oz x 80 % -> $/g 0.8038 x 0.8; Cu 0.45 % = 4,500 g/t at $4/lb x 85 % -> $/g 0.008818 x 0.85; Au 2000/oz x 90 % = 57.87 $/g
  const byHand = 1.2 + (30 * (25 / 31.1034768) * 0.8) / ((2000 / 31.1034768) * 0.9) + (4500 * (4 / 453.59237) * 0.85) / ((2000 / 31.1034768) * 0.9);
  assert.ok(Math.abs(r.assays[0].values.AuEq - byHand) < 1e-6, `${r.assays[0].values.AuEq} vs ${byHand}`);
});

test("#3923 the inputs are kept with the element: base, each price in its unit, each recovery, the audit sentence", () => {
  const d = equivalentFromInputs(typed, elements);
  assert.deepEqual(d.meta.metals, [{ symbol: "Au", price: 2000, priceUnit: "$/oz", recovery: 90 }, { symbol: "Ag", price: 25, priceUnit: "$/oz", recovery: 80 }, { symbol: "Cu", price: 4, priceUnit: "$/lb", recovery: 85 }]);
  assert.equal(d.meta.base, "Au");
  assert.match(d.text, /^AuEq = Au x 1/);
  assert.match(d.text, /2000\/oz x 90%/);
});

test("#3923 the base metal can be another: CuEq in %, and a stored unit is converted by the coefficient", () => {
  const d = equivalentFromInputs(eq({ Cu: { price: "4", recovery: "85" }, Au: { on: true, price: "2000", recovery: "90" } }, "Cu"), elements);
  assert.equal(d.name, "CuEq"); assert.equal(d.unit, "%");
  const r = addCalculatedElement(assays, elements.filter((e) => !e.calculated), d.name, d.expr, d.unit);
  const byHand = 0.45 + (1.2 * (2000 / 31.1034768) * 0.9) / ((4 / 453.59237) * 0.85) / 10000; // Au g/t -> value per t, over Cu's value per g, ppm -> %
  assert.ok(Math.abs(r.assays[0].values.CuEq - byHand) < 1e-6 * byHand, `${r.assays[0].values.CuEq} vs ${byHand}`);
});

test("#3923 the starting base metal, and the panel's wiring", () => {
  assert.equal(suggestedBase(elements), "Au"); assert.equal(suggestedBase([{ symbol: "Zn", unit: "%" }, { symbol: "Pb", unit: "%" }]), "Zn"); assert.equal(suggestedBase([]), "");
  const g = fs.readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(g, /e\.target\.value === "__equivalent"/);
  assert.match(g, /<EquivalentBuilder elements=\{calcEls\} eq=\{calc\.eq\} result=\{equivalentFromInputs\(calc\.eq, calcEls\)\}/);
  assert.match(g, /calculated: \{ \.\.\.r\.element\.calculated, equivalent: calc\.eqMeta \}/);
  assert.match(g, /expr: e\.target\.value, eqMeta: null/, "a hand edit of the formula ends the record of the inputs");
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const j = JSON.parse(fs.readFileSync(new URL(`../src/locales/${lang}.json`, import.meta.url), "utf8"));
    for (const k of ["Metal equivalent (you type the prices and recoveries)…", "Pick the base metal.", "Metals added to it"]) assert.ok(j[k], `${lang}: ${k}`);
  }
});
