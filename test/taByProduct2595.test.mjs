// TASKS.csv #2595 — tantalum (and vanadium) quoted per pound of the oxide: $/lb Ta2O5 first, the cut-off and revenue on that basis
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { pitEconomics, priceUnitsFor, pitMetalOf, metalAmountText, PRICED_MASS_T } from "../src/lib/pitShell.js";

const LB = 2204.62262;

test("$80/lb Ta2O5: cut-off 0.0279 % Ta (the review's hand figure), 1.221 x the $/lb Ta reading", () => {
  const ox = pitEconomics({ unit: "%", element: "Ta", price: 80, priceUnit: "lbTa2O5", recovery: 50, processingCost: 30 });
  assert.ok(Math.abs(ox.cutoff - 30 / (0.01 * 0.5 * 80 * LB * 1.221)) < 1e-12, String(ox.cutoff));
  assert.equal(+ox.cutoff.toFixed(4), 0.0279);
  const metal = pitEconomics({ unit: "%", element: "Ta", price: 80, priceUnit: "lb", recovery: 50, processingCost: 30 });
  assert.equal(+metal.cutoff.toFixed(4), 0.034); // the old reading, still there as "$/lb Ta"
  assert.ok(Math.abs(ox.revenuePerGrade / metal.revenuePerGrade - 1.221) < 1e-9);
  // as a by-product beside Li, the by-product's own cut-off follows
  const both = pitEconomics({ unit: "%", element: "Li", price: 35878, priceUnit: "t", recovery: 70, processingCost: 30, by: { unit: "%", element: "Ta", price: 80, priceUnit: "lbTa2O5", recovery: 50 } });
  assert.equal(+both.by.cutoff.toFixed(4), 0.0279);
});

test("price units and contained metal: Ta and V by the pound of oxide first, the rest unchanged", () => {
  assert.deepEqual(priceUnitsFor(pitMetalOf("%", "Ta"), "Ta").map(([, l]) => l), ["$/lb Ta2O5", "$/t Ta2O5", "$/t Ta", "$/lb Ta"]);
  assert.equal(priceUnitsFor(pitMetalOf("%", "V"), "V")[0][1], "$/lb V2O5");
  assert.equal(priceUnitsFor(pitMetalOf("%", "Nb"), "Nb")[0][1], "$/t Nb2O5");
  assert.ok(Math.abs(PRICED_MASS_T.lbTa2O5 - 1 / (1.221 * LB)) < 1e-15);
  assert.equal(metalAmountText(1000, "t", "Ta", (v) => Math.round(v).toLocaleString("en-US")), "1,000 t Ta (1,221 t / 2,691,844 lb Ta2O5)");
  assert.equal(metalAmountText(1000, "t", "Sn", (v) => Math.round(v).toLocaleString("en-US")), "1,000 t Sn (1,270 t SnO2)");
});

test("the by-product unit picker is wide enough for '$/lb Ta2O5', and its contained metal is in its own words", () => {
  assert.match(fs.readFileSync("src/components/PitShellPane.jsx", "utf8"), /metalText\(res\.by, res\.byElement\)/);
  assert.match(fs.readFileSync("src/components/PitShellPane.jsx", "utf8"), /value=\{byPriceUnit \|\| ""\} onChange=\{set\("byPriceUnit"\)\} style=\{\{ \.\.\.smallSel, width: \(byPrices \|\| \[\]\)\.some/);
});
