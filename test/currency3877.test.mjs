// TASKS.csv #3877 (Matt's decision, 2026-11-17; follow-up of #3797) — the project currency in the places #3797 left on a bare '$': the pit solids' params,
// the Nested pits chart axis, the planned holes' drilling rates and program cost, and the Currency field in Pit shell (where the prices are typed).
// The Dump pane prints no money at all (checked: no price, cost or '$' in it), so it has nothing to change.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { withCurrency, moneyText, currencyOf } from "../src/lib/currency.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("the drilling-cost texts take the currency, a blank project keeps the $", () => {
  const texts = [["Cost ($/m)", "Cost (CAD/m)"], ["Per hole ($)", "Per hole (CAD)"], [" — est. $12,500 at $85/m", " — est. CAD 12,500 at CAD 85/m"], ["Fixed: 3 hole(s) × $500 + 2 new pad(s) × $1,000 = $3,500", "Fixed: 3 hole(s) × CAD 500 + 2 new pad(s) × CAD 1,000 = CAD 3,500"]];
  for (const [a, b] of texts) { assert.equal(withCurrency(a, "CAD"), b); assert.equal(withCurrency(a, "$"), a); }
  assert.equal(withCurrency("Cost ($/m)", "€"), "Cost (€/m)");
  assert.equal(currencyOf({}), "$"); assert.equal(currencyOf({ currency: " AUD " }), "AUD");
  assert.equal(moneyText("€", "1.2M"), "€1.2M"); assert.equal(moneyText("AUD", "1.2M"), "AUD 1.2M");
});

test("each pit solid records the currency its prices were typed in", () => {
  for (const f of ["../src/components/PitShellPane.jsx", "../src/components/NestedPitsPane.jsx", "../src/components/PitDesignPane.jsx"]) {
    assert.match(read(f), /params: \{ tool: "[^"]+", currency: cur /, f);
  }
});

test("the Nested pits chart prints its axis in the currency, not a literal $", () => {
  const s = read("../src/components/NestedPitsPane.jsx");
  assert.match(s, /<Chart runs=\{res\.runs\} best=\{res\.bestNpv\} cur=\{cur\} \/>/);
  assert.match(s, /moneyText\(cur, big\(vMax\)\)/); assert.match(s, /moneyText\(cur, big\(vMin\)\)/);
  assert.doesNotMatch(s, />\$\{big\(v(Max|Min)\)\}</);
});

test("the planned-hole checks write the drilling rates and costs in the project currency", () => {
  const s = read("../src/components/PlannedHoleParts.jsx");
  assert.match(s, /import \{ t as tr, t as trRaw \} from "\.\.\/lib\/i18n\.js"/);
  assert.match(s, /export function PlannedHoleChecks[\s\S]*?const cur = currencyOf\(project\), tr = \(k, v\) => withCurrency\(trRaw\(k, v\), cur\)/);
});

test("Pit shell has the Currency field, its blank label keeps the $", () => {
  const s = read("../src/components/PitShellPane.jsx");
  assert.match(s, /setProjectCurrency \} = useStore\(\)/);
  assert.match(s, /trRaw\("Currency \(blank: \$\)"\)/);
  assert.match(s, /onChange=\{\(e\) => setProjectCurrency\?\.\(e\.target\.value\)\}/);
});
