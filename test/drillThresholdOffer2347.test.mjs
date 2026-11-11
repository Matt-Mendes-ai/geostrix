// TASKS.csv #2347 (Matt's decision) — a saved drill threshold is OFFERED, never applied: Best intercepts shows it beside the cutoff, with its
// rule, population and date; a surface record or one in another unit is not offered.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { drillThresholdOffers } from "../src/lib/thresholds.js";

const drill = { symbol: "Au", unit: "g/t", source: "drill", method: "mad", methodLabel: "Median + 2 MAD", groupLabel: "Lithology", values: { VCL: 11.8, DACT: 3.2, AND: null }, decided: "2026-11-09" };
const surface = { symbol: "Au", unit: "g/t", method: "p95", methodLabel: "P95", groupLabel: "Medium", values: { soil: 0.05 }, decided: "2026-11-01" };

test("the drill record's values per population, not the surface one's; none in another unit", () => {
  const o = drillThresholdOffers([surface, drill], "Au", "g/t");
  assert.deepEqual(o.map((x) => [x.population, x.value]), [["Lithology: VCL", 11.8], ["Lithology: DACT", 3.2]]);
  assert.equal(o[0].rule, "Median + 2 MAD"); assert.equal(o[0].decided, "2026-11-09");
  assert.deepEqual(drillThresholdOffers([surface], "Au", "g/t"), []);
  assert.deepEqual(drillThresholdOffers([drill], "Au", "ppm"), []);
  assert.deepEqual(drillThresholdOffers([drill], "Cu", "g/t"), []);
});

test("Best intercepts offers them as buttons; the cutoff only changes on a click", () => {
  const b = readFileSync(new URL("../src/components/BestIntercepts.jsx", import.meta.url), "utf8");
  assert.match(b, /drillThresholdOffers\(geochemThresholds, symbol, unit\)/);
  assert.match(b, /onClick=\{\(\) => \{ setCutoff\(o\.value\); setSuggested\(null\); \}\}/);
  assert.doesNotMatch(b, /useState\(\(\) => drillThresholdOffers/, "never the starting cutoff");
});
