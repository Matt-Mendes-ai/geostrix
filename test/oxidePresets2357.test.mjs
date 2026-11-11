// TASKS.csv #2357 — Calc. element offers element-to-oxide presets (U3O8, Li2O, Ta2O5 ...) with stoichiometric factors and their unit
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CALC_PRESETS, addCalculatedElement } from "../src/lib/calcElement.js";

// molar masses (g/mol)
const M = { U: 238.029, Li: 6.941, Ta: 180.948, Nb: 92.906, V: 50.942, W: 183.84, Sn: 118.71, Cs: 132.905, Rb: 85.468, O: 15.999 };
const OX = { U3O8: ["U", 3, 8], Li2O: ["Li", 2, 1], Ta2O5: ["Ta", 2, 5], Nb2O5: ["Nb", 2, 5], V2O5: ["V", 2, 5], WO3: ["W", 1, 3], SnO2: ["Sn", 1, 2], Cs2O: ["Cs", 2, 1], Rb2O: ["Rb", 2, 1] };

test("each oxide preset's factor is the oxide's molar mass over the element's, to within the molar-mass tables", () => {
  for (const [name, [el, n, o]] of Object.entries(OX)) {
    const p = CALC_PRESETS.find((x) => x.name === name);
    assert.ok(p, name);
    const f = Number(p.expr.split("*")[1]);
    assert.ok(Math.abs(f - (n * M[el] + o * M.O) / (n * M[el])) < 5e-4, `${name}: ${f}`); // molar-mass tables differ in the 4th digit (Li 6.94 / 6.941)
    assert.deepEqual(p.needs, [el]);
    assert.ok(p.unit && p.units[el] === p.unit, name);
  }
});

test("U3O8 on assays stored in ppm", () => {
  const assays = [{ hole_id: "A", from: 0, to: 1, values: { U: 1000 } }];
  const p = CALC_PRESETS.find((x) => x.name === "U3O8");
  const r = addCalculatedElement(assays, [{ symbol: "U", unit: "ppm" }], p.name, p.expr, p.unit, { readUnits: p.units });
  assert.ok(Math.abs(r.assays[0].values.U3O8 - 1179.2) < 1e-6);
  assert.equal(r.element.unit, "ppm");
});

test("the preset sets the result's unit in the dialog", () => {
  const g = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
  assert.match(g, /expr: p\.expr, unit: p\.unit \|\| "index"/);
});
