// TASKS.csv #3160 — #2925's remaining slips (review #2876, WA iron): (1) the saved-threshold offers, highest first and all of them;
// (7) flat bedding in one click; (8) Calc. element's oxide units and a division by zero counted apart; (9) 'Total per hole' windowed
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sortedThresholdOffers } from "../src/lib/thresholds.js";
import { addCalculatedElement } from "../src/lib/calcElement.js";
import { trueWidthFactor } from "../src/lib/trueWidth.js";

test("(1) the offers highest first", () => {
  const o = [{ key: "ALU", value: 33.71 }, { key: "ONAM", value: 64.16 }, { key: "DIW", value: 50.47 }, { key: "TNAM", value: 62.23 }];
  assert.deepEqual(sortedThresholdOffers(o).map((x) => x.key), ["ONAM", "TNAM", "DIW", "ALU"]);
  assert.equal(o[0].key, "ALU", "the input is not reordered");
  const B = readFileSync(new URL("../src/components/BestIntercepts.jsx", import.meta.url), "utf8");
  assert.match(B, /const offers = sortedThresholdOffers\(drillThresholdOffers\(geochemThresholds, symbol, unit\)\);/);
  assert.match(B, /\{offers\.length > 4 && <select /);
  assert.match(B, /\{offers\.length <= 4 && offers\.map\(/);
});

test("(8) a division by zero is not 'missing an element'", () => {
  const assays = [{ values: { Fe: 60, Si: 3 } }, { values: { Fe: 55, Si: 0 } }, { values: { Fe: 50 } }];
  const r = addCalculatedElement(assays, [{ symbol: "Fe", unit: "%" }, { symbol: "Si", unit: "%" }], "FeSi", "Fe / Si");
  assert.equal(r.computed, 1); assert.equal(r.divZero, 1); assert.equal(r.skipped, 1);
  const G = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
  assert.equal((G.match(/r\.divZero \? tr\("; \{n\} divided by zero, so no value"/g) || []).length, 2, "both notices (assays, surface samples)");
  assert.match(G, /\.map\(\(e\) => e\.unit\)\.filter\(\(u\) => u && unitBasis\(u\)\.oxide\)\) \/\* #3160/);
});

test("(7) flat bedding: a vertical hole's true width is its downhole length", () => {
  assert.equal(trueWidthFactor({ x: 0, y: 0, z: -1 }, 0, 0), 1);
  const B = readFileSync(new URL("../src/components/BestIntercepts.jsx", import.meta.url), "utf8");
  assert.match(B, /onClick=\{\(\) => \{ setTwDipDirText\("0"\); setTwDipText\("0"\); \}\}/);
});

test("(9) Total per hole: kept with the results and windowed", () => {
  const B = readFileSync(new URL("../src/components/BestIntercepts.jsx", import.meta.url), "utf8");
  assert.match(B, /const holeRows = useMemo\(\(\) => \(perHole && results\.length \? holeTotals\(results\) : \[\]\), \[perHole, results\]\);/);
  assert.match(B, /hs\.slice\(hv\.startIndex, hv\.endIndex\)\.map\(/);
  assert.equal((B.match(/holeTotals\(/g) || []).length, 1);
});
