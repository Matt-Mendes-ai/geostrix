// TASKS.csv #2509 — Jensen decides by aluminium first: a sample near the Al corner is never a tholeiite
import test from "node:test";
import assert from "node:assert/strict";
import { jensenClass, GEOCHEM_METHODS } from "../src/lib/geochemDiagrams.js";

test("the reported pegmatite (Al 98.9 %, Fe+Ti 0.7 %, Mg 0.3 %) is calc-alkaline rhyolite, not Mg-tholeiite", () => {
  assert.equal(jensenClass(98.9, 0.7, 0.3), "CA-RHY");
});

test("aluminium decides first; Fe against Mg only below the divider", () => {
  assert.equal(jensenClass(80, 15, 5), "CA-RHY");
  assert.equal(jensenClass(66, 30, 4), "CA-DAC", "more Fe than Mg above the divider stays calc-alkaline");
  assert.equal(jensenClass(60, 25, 15), "CA-AND");
  assert.equal(jensenClass(52, 30, 18), "CA-BASALT");
  assert.equal(jensenClass(30, 50, 20), "THOL-FE");
  assert.equal(jensenClass(40, 25, 35), "THOL-MAFIC");
  assert.equal(jensenClass(20, 20, 60), "KOM");
  assert.equal(jensenClass(NaN, 1, 1), null);
});

test("the classifier runs through it, from element values", () => {
  // a pegmatite-like sample: Al 8 %, Fe 0.1 %, Ti 0.01 %, Mg 0.02 %
  const c = GEOCHEM_METHODS.litho_jensen.classify({ Al: 8, Fe: 0.1, Ti: 0.01, Mg: 0.02 }, { Al: "%", Fe: "%", Ti: "%", Mg: "%" });
  assert.equal(c, "CA-RHY");
  // a basalt-like sample (Al2O3 15, FeO 10, TiO2 1, MgO 8 as elements) sits below the divider and has more Mg cations: Mg-tholeiite
  const b = GEOCHEM_METHODS.litho_jensen.classify({ Al: 7.94, Fe: 7.77, Ti: 0.6, Mg: 4.82 }, { Al: "%", Fe: "%", Ti: "%", Mg: "%" });
  assert.equal(b, "THOL-MAFIC");
});
