// TASKS.csv #2434 (review #2325, WA uranium) — uranium priced per lb of U3O8; U3O8 grades counted in tonnes; one contained-metal wording
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pitEconomics, pitMetalOf, priceUnitsFor, PRICED_MASS_T, metalAmountText, U3O8_PER_U } from "../src/lib/pitShell.js";

const base = { unit: "ppm", price: 80, recovery: 85, processingCost: 25 };

test("a U grade: $/lb U3O8 first, and the cut-off the review computed by hand", () => {
  const m = pitMetalOf("ppm", "U");
  assert.deepEqual(priceUnitsFor(m, "U").map(([k]) => k), ["lbU3O8", "lb", "kgU"]);
  const ox = pitEconomics({ ...base, element: "U", priceUnit: "lbU3O8" });
  assert.ok(Math.abs(ox.cutoff - 25 / (1e-6 * 0.85 * 80 * 2204.62262 * U3O8_PER_U)) < 1e-6);
  assert.equal(Math.round(ox.cutoff), 141);
  const u = pitEconomics({ ...base, element: "U", priceUnit: "lb" }); // per lb of U metal, as before
  assert.equal(Math.round(u.cutoff), 167);
  // $/kg U: 80 $/lb U = 176.37 $/kg U, the same cut-off
  assert.ok(Math.abs(pitEconomics({ ...base, element: "U", priceUnit: "kgU", price: 80 * 2.20462262 }).cutoff - u.cutoff) < 1e-6);
});

test("a U3O8 / eU3O8 grade is the oxide: tonnes, priced per lb or t of U3O8 (not troy ounces)", () => {
  for (const el of ["U3O8", "eU3O8"]) {
    const m = pitMetalOf("ppm", el);
    assert.equal(m.unit, "t");
    assert.deepEqual(priceUnitsFor(m, el), [["lb", "$/lb U3O8"], ["t", "$/t U3O8"]]);
    assert.equal(Math.round(pitEconomics({ ...base, element: el, priceUnit: "lb" }).cutoff), 167);
  }
  assert.deepEqual(priceUnitsFor(pitMetalOf("ppm", "Cu"), "Cu"), [["lb", "$/lb"], ["t", "$/t"]]);
});

test("a price converts between the units by the mass each prices; the words are shared", () => {
  assert.ok(Math.abs(80 * (PRICED_MASS_T.lb / PRICED_MASS_T.lbU3O8) - 94.336) < 1e-3); // 80 $/lb U3O8 = 94.34 $/lb U
  const big = (v) => Math.round(v).toLocaleString("en");
  assert.equal(metalAmountText(498, "t", "U", big), "498 t U (1,294,646 lb U3O8)");
  assert.equal(metalAmountText(100, "t", "U3O8", big), "100 t U3O8 (220,462 lb U3O8)");
  assert.equal(metalAmountText(100, "t", "Cu", big), "100 t (220,462 lb)");
  assert.equal(metalAmountText(31.1034768 * 10, "g", "Au", big), "10 oz");
  for (const f of ["PitShellPane", "NestedPitsPane", "PitDesignPane"]) assert.match(readFileSync(new URL(`../src/components/${f}.jsx`, import.meta.url), "utf8"), /metalAmountText\(/);
});
