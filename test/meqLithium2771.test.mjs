// TASKS.csv #2771 — the metal equivalent prices lithium per tonne of Li2CO3 (LCE)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TRADED_OXIDE, pricePerGram, metalEquivalent, metalEquivalentFormula } from "../src/lib/geochem.js";

test("Li's share of Li2CO3 matches the atomic masses; the price is per tonne", () => {
  const Li = 6.94, C = 12.011, O = 15.999;
  assert.ok(Math.abs(TRADED_OXIDE.Li.factor - (2 * Li) / (2 * Li + C + 3 * O)) < 5e-4);
  assert.equal(TRADED_OXIDE.Li.per, "t");
  // 10,000 $/t LCE is 10,000 / 0.1879 $ per tonne of Li, i.e. per 1e6 g
  assert.ok(Math.abs(pricePerGram("Li", 10000, true) - 10000 / 0.1879 / 1e6) < 1e-12);
});

test("a Li + Ta equivalent with LCE per tonne, and the formula says so", () => {
  const metals = [{ symbol: "Li", unit: "ppm", price: 10000, recovery: 1, oxide: true }, { symbol: "Ta", unit: "ppm", price: 100, recovery: 1 }];
  const eq = metalEquivalent({ Li: 5000, Ta: 100 }, metals);
  const expect = 5000 + (100 * (100 / 453.59237)) / (10000 / 0.1879 / 1e6);
  assert.ok(Math.abs(eq - expect) < 1e-6, `${eq} vs ${expect}`);
  assert.match(metalEquivalentFormula(metals), /10000\/t Li2CO3/);
});

test("wired: the tick box and its tooltip", () => {
  const b = readFileSync(new URL("../src/components/BestIntercepts.jsx", import.meta.url), "utf8");
  assert.match(b, /\$\/\$\{TRADED_OXIDE\[s\]\.per \|\| "lb"\} \$\{TRADED_OXIDE\[s\]\.oxide\}/);
  assert.match(b, /TRADED_OXIDE\[s\]\.per === "t" \? tr\("\{oxide\} is how \{s\} is sold: the price is per tonne/);
});
