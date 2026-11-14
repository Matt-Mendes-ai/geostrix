// TASKS.csv #3291 (#3226 (3)) — a rock-forming major stored in ppm answers to its oxide names (K2O, Al2O3 ...), in ppm of the oxide; a ppm trace element still does not. SYNTHETIC.
import { test } from "node:test";
import assert from "node:assert/strict";
import { oxideAliases } from "../src/lib/geochem.js";
test("majors in ppm get their oxides; traces do not; per cent as before", () => {
  const a = oxideAliases([{ symbol: "Al", unit: "ppm" }, { symbol: "K", unit: "ppm" }, { symbol: "Cu", unit: "ppm" }, { symbol: "Ca", unit: "%" }]);
  const by = Object.fromEntries(a.map((x) => [x.name, x]));
  assert.ok(by.Al2O3 && by.K2O && by.CaO); assert.ok(!by.CuO);
  assert.equal(by.Al2O3.unit, "ppm Al2O3"); assert.ok(Math.abs(by.Al2O3.factor - 1.8895) < 1e-3);
  assert.equal(by.CaO.unit, "% CaO");
  assert.ok(Math.abs(by.K2O.factor - 1.2046) < 1e-3);
});
