// TASKS.csv #2592 (review #2486, WA lithium) — a commodity priced as the product it is sold as: lithium per tonne of spodumene concentrate
// (SC6), lithium carbonate equivalent or Li2O; tantalum, niobium, tin, tungsten and vanadium per tonne of their oxide
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SOLD_AS, priceUnitsFor, pitEconomics, pitMetalOf, metalAmountText, PRICED_MASS_T } from "../src/lib/pitShell.js";

test("1,000 $/t of SC6 is 35,878 $/t of Li: the review's hand figure, and the pane's cut-off", () => {
  const sc6 = pitEconomics({ unit: "%", element: "Li", price: 1000, priceUnit: "tSC6", recovery: 70, processingCost: 30 });
  const li = pitEconomics({ unit: "%", element: "Li", price: 1000 * 2.1527 / 0.06, priceUnit: "t", recovery: 70, processingCost: 30 });
  assert.ok(Math.abs(sc6.revenuePerGrade - li.revenuePerGrade) < 1e-6);
  assert.ok(Math.abs(sc6.cutoff - 30 / (0.01 * 0.7 * 35878.3)) < 1e-4, String(sc6.cutoff)); // 0.119 % Li
  const lce = pitEconomics({ unit: "%", element: "Li", price: 10000, priceUnit: "tLCE", recovery: 70, processingCost: 30 });
  assert.ok(Math.abs(lce.revenuePerGrade - 0.01 * 0.7 * 10000 * 5.3235) < 1e-6);
});

test("the price units name the products and the element; other commodities keep theirs", () => {
  const li = priceUnitsFor(pitMetalOf("%", "Li"), "Li").map(([k, l]) => `${k}=${l}`);
  assert.deepEqual(li, ["tSC6=$/t SC6 (spodumene concentrate, 6 % Li2O)", "tLCE=$/t LCE (lithium carbonate equivalent)", "tLi2O=$/t Li2O", "t=$/t Li", "lb=$/lb Li"]);
  assert.deepEqual(priceUnitsFor(pitMetalOf("ppm", "Ta"), "Ta").map(([k]) => k), ["lbTa2O5", "tTa2O5", "t", "lb"]); // lbTa2O5 first: #2595 // ppm Ta counted in tonnes, not ounces
  assert.equal(priceUnitsFor(pitMetalOf("%", "Cu"), "Cu")[0][0], "lb"); // copper unchanged
  assert.equal(priceUnitsFor(pitMetalOf("ppm", "U"), "U")[0][0], "lbU3O8"); // #2434 unchanged
  assert.ok(Math.abs(PRICED_MASS_T.tLi2O - 1 / 2.1527) < 1e-12);
  assert.match(metalAmountText(1000, "t", "Li", (v) => Math.round(v).toLocaleString("en-US")), /^1,000 t Li \(35,878 t SC6, 5,324 t LCE, 2,153 t Li2O\)$/);
});

test("the oxide factors are the import's (geochem OXIDE_HEADERS)", () => {
  const g = readFileSync(new URL("../src/lib/geochemColumns.js", import.meta.url), "utf8"); // TASKS.csv #3159 — OXIDE_HEADERS moved there from geochem.js
  for (const [el, list] of Object.entries(SOLD_AS)) for (const [p, f] of list) {
    if (p === "SC6" || p === "LCE") continue;
    assert.match(g, new RegExp(`${p}: \\["${el}", ${String(f).replace(".", "\\.")}\\]`), `${p} ${f}`);
  }
});
