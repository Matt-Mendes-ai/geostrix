// TASKS.csv #1748 (review #1645, Copley) — copper in ppm is priced per pound / tonne and reported in tonnes, not troy ounces
import test from "node:test";
import assert from "node:assert/strict";
import { pitEconomics, pitMetalOf, elementOfModel, PRICE_UNITS } from "../src/lib/pitShell.js";

test("Cu in ppm: tonnes of metal, $/lb; the cut-off is in ppm", () => {
  const m = pitMetalOf("ppm", "Cu");
  assert.deepEqual(m, { factor: 1e-6, unit: "t" });
  assert.deepEqual(PRICE_UNITS[m.unit].map(([k]) => k), ["lb", "t"]);
  const e = pitEconomics({ unit: "ppm", element: "Cu", price: 4, priceUnit: "lb", recovery: 90, processingCost: 20 });
  assert.ok(Math.abs(e.cutoff - 20 / (1e-6 * 0.9 * 4 * 2204.62262)) < 1e-6, String(e.cutoff)); // ~2,520 ppm
  assert.equal(e.metalUnit, "t");
});

test("gold in g/t stays in grams / ounces; Cu in % unchanged; unknown elements as before", () => {
  assert.equal(pitMetalOf("g/t", "Au").unit, "g");
  assert.deepEqual(pitMetalOf("%", "Cu"), { factor: 0.01, unit: "t" });
  assert.equal(pitMetalOf("ppm", null).unit, "g");
});

test("elementOfModel: estimate parameters, else the symbol starting the name", () => {
  assert.equal(elementOfModel({ params: { element: "Cu" }, name: "x" }), "Cu");
  assert.equal(elementOfModel({ name: "Cu estimate (idw2, 20.5m)" }), "Cu");
  assert.equal(elementOfModel({ name: "Fault block" }), null);
});
