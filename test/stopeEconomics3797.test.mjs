// TASKS.csv #3797 (Matt's decision, 2026-11-16) — the optional economics of Stope outlines and the project currency. Hand figures: gold at 2,000 per oz, 90 % recovery: revenue per tonne per g/t of
// grade = 0.9 x 2,000 / 31.1034768 = 57.87; mining 60 + processing 30 per tonne: break-even (60 + 30) / 57.87 = 1.555 g/t, the mill cut-off 30 / 57.87 = 0.518 g/t. Synthetic stopes.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stopeEconomicsSetup, stopeValue, stopeValueCells, NOT_INCLUDED } from "../src/lib/stopeEconomics.js";
import { currencyOf, withCurrency, moneyText } from "../src/lib/currency.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const gold = { unit: "ppm", element: "Au", price: 2000, priceUnit: "oz", recovery: 90, miningCost: 60, processingCost: 30, otherCost: 0 };

test("the break-even carries the mining cost, the mill cut-off does not; each names what it includes", () => {
  const s = stopeEconomicsSetup(gold);
  assert.ok(Math.abs(s.revenuePerGrade - 57.87) < 0.01, `${s.revenuePerGrade}`);
  assert.ok(Math.abs(s.breakEven - 1.555) < 0.002, `${s.breakEven}`);
  assert.ok(Math.abs(s.mill - 0.5184) < 0.001, `${s.mill}`);
  assert.deepEqual(s.includes, ["mining", "processing"]);
  assert.equal(s.perTonne.total, 90);
  const withOther = stopeEconomicsSetup({ ...gold, otherCost: 10 });
  assert.ok(Math.abs(withOther.breakEven - 100 / 57.87) < 0.002); assert.deepEqual(withOther.includes, ["mining", "processing", "other"]);
  // nothing typed, or nothing that can be priced: no economics
  assert.equal(stopeEconomicsSetup({ ...gold, price: "" }), null);
  assert.equal(stopeEconomicsSetup({ ...gold, recovery: 0 }), null);
  assert.equal(stopeEconomicsSetup({ ...gold, miningCost: "", processingCost: "", otherCost: "" }), null);
  assert.equal(stopeEconomicsSetup({ ...gold, miningCost: -5 }), null);
  assert.ok(stopeEconomicsSetup({ ...gold, miningCost: "", processingCost: 30 }).mill > 0, "processing only: both figures are the mill's");
  assert.ok(NOT_INCLUDED.includes("pillars") && NOT_INCLUDED.includes("stope optimization"));
});

test("revenue, cost and margin per stope, level and in total on the diluted tonnes", () => {
  const setup = stopeEconomicsSetup(gold);
  // a stope of 5,625 t diluted holding 8 g/t over 5,000 t and nothing over 625 t of skin: 40,000 g of metal; cost 5,625 x 90
  const result = { levels: [{ rl: 100, stopes: [{ tonnes: 5625, metalU: 40000 }, { tonnes: 1000, metalU: 2500 }] }, { rl: 120, stopes: [{ tonnes: 2000, metalU: 4000 }] }] };
  const v = stopeValue(result, setup), rpg = setup.revenuePerGrade;
  assert.ok(Math.abs(v.levels[0].stopes[0].revenue - 40000 * rpg) < 1e-6);
  assert.equal(v.levels[0].stopes[0].cost, 5625 * 90);
  assert.ok(Math.abs(v.levels[0].stopes[0].margin - (40000 * rpg - 5625 * 90)) < 1e-6);
  assert.ok(Math.abs(v.levels[0].revenue - 42500 * rpg) < 1e-6 && v.levels[0].cost === 6625 * 90);
  assert.ok(Math.abs(v.totals.revenue - 46500 * rpg) < 1e-6 && v.totals.cost === 8625 * 90);
  assert.ok(Math.abs(v.totals.margin - (v.totals.revenue - v.totals.cost)) < 1e-6);
  assert.ok(v.levels[1].stopes[0].margin < 0 === (4000 * rpg < 2000 * 90), "a stope under its cost shows a negative margin");
  const cells = stopeValueCells(v, 0, 1, "CAD");
  assert.equal(cells.currency, "CAD"); assert.equal(cells.stope_cost, 90000); assert.equal(cells.level_cost, 6625 * 90); assert.equal(cells.total_cost, 8625 * 90);
});

test("the currency: blank is '$'; a symbol goes before the amount, a code before it with a space; unit labels take it", () => {
  assert.equal(currencyOf({}), "$"); assert.equal(currencyOf({ currency: "  " }), "$"); assert.equal(currencyOf({ currency: " CAD " }), "CAD"); assert.equal(currencyOf(null), "$");
  assert.equal(moneyText("$", "123M"), "$123M"); assert.equal(moneyText("€", "12M"), "€12M"); assert.equal(moneyText("CAD", "123M"), "CAD 123M");
  assert.equal(withCurrency("mining $60/t, processing $30/t", "CAD"), "mining CAD 60/t, processing CAD 30/t", "an amount after the code gets a space"); assert.equal(withCurrency("margin $1.2M", "€"), "margin €1.2M");
  assert.equal(withCurrency("Mining cost ($/t rock)", "CAD"), "Mining cost (CAD/t rock)"); assert.equal(withCurrency("$/oz", "$"), "$/oz"); assert.equal(withCurrency("$/lb U3O8 and $/t", "AUD"), "AUD/lb U3O8 and AUD/t");
});

test("wiring: the ribbon, the pane's economics section, the CSV, the solids' params and the project field", () => {
  const p = read("../src/components/StopesPane.jsx");
  assert.match(p, /stopeEconomicsSetup/); assert.match(p, /Use it as the cut-off/); assert.match(p, /stopeValueCells/);
  assert.match(p, /economics: res\.econ \?/);
  assert.match(read("../src/lib/store.jsx"), /setProjectCurrency/);
  for (const f of ["PitShellPane", "NestedPitsPane", "PitDesignPane"]) {
    const t = read(`../src/components/${f}.jsx`);
    assert.match(t, /const cur = currencyOf\((shellProject|project)\), tr = \(k, v\) => withCurrency\(trRaw\(k, v\), cur\)/, f);
  }
  assert.match(read("../src/components/PitShellPane.jsx"), /moneyText\(cur, big\(res\.money\)\)/);
});
