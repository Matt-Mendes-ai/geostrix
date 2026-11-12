// TASKS.csv #2731 — Best intercepts' metal equivalent prices uranium (and V, W) per lb of its traded oxide
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { metalEquivalent, metalEquivalentFormula, pricePerGram, TRADED_OXIDE } from "../src/lib/geochem.js";

test("the oxide shares match the atomic masses", () => {
  const U = 238.02891, V = 50.9415, W = 183.84, O = 15.999;
  assert.ok(Math.abs(TRADED_OXIDE.U.factor - (3 * U) / (3 * U + 8 * O)) < 5e-4);
  assert.ok(Math.abs(TRADED_OXIDE.V.factor - (2 * V) / (2 * V + 5 * O)) < 5e-4);
  assert.ok(Math.abs(TRADED_OXIDE.W.factor - W / (W + 3 * O)) < 5e-4);
});

test("a price per lb U3O8 is worth more per gram of U; other elements are unchanged", () => {
  assert.ok(Math.abs(pricePerGram("U", 80, true) / pricePerGram("U", 80) - 1 / 0.848) < 1e-9);
  assert.equal(pricePerGram("Cu", 4, true), pricePerGram("Cu", 4));
});

test("U priced per lb U3O8 against V per lb V2O5: the equivalent uses the element grades", () => {
  // 1,000 ppm U and 2,000 ppm V; U3O8 80 $/lb, V2O5 8 $/lb, 100 % recovery: UEq = 1000 + 2000 * (8 / 0.5602) / (80 / 0.848)
  const eq = metalEquivalent({ U: 1000, V: 2000 }, [{ symbol: "U", unit: "ppm", price: 80, recovery: 1, oxide: true }, { symbol: "V", unit: "ppm", price: 8, recovery: 1, oxide: true }]);
  assert.ok(Math.abs(eq - (1000 + 2000 * (8 / 0.5602) / (80 / 0.848))) < 1e-6, String(eq));
  assert.match(metalEquivalentFormula([{ symbol: "U", unit: "ppm", price: 80, recovery: 1, oxide: true }, { symbol: "V", unit: "ppm", price: 8, recovery: 1, oxide: true }]), /8\/lb V2O5 x 100%\) \/ \(80\/lb U3O8/);
});

test("wired: per lb of the oxide unless unticked", () => {
  const b = readFileSync(new URL("../src/components/BestIntercepts.jsx", import.meta.url), "utf8");
  assert.match(b, /oxide: !!TRADED_OXIDE\[s\] && meqInputs\[s\]\?\.oxide !== false/);
});
