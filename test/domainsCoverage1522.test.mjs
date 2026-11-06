// TASKS.csv #1522 — Domains on Lawyers' soils opened with 0 of 49 elements ticked: 422 of 3,243 soils have no ICP, so every element sat at
// 87 % against the 90 % rule. The rule is applied to the multi-element samples now, and the panel says how many were set aside.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { elementCoverage, usableElements } from "../src/lib/geochemDomains.js";

const els = ["Au", "Cu", "Zn", "Pb", "As"].map((symbol) => ({ symbol, unit: "ppm" }));
const units = Object.fromEntries(els.map((e) => [e.symbol, "ppm"]));
const icp = (i) => ({ values: { Au: 0.01 + i / 1000, Cu: 20 + i, Zn: 50 + i, Pb: 10 + i, As: i % 20 === 0 ? undefined : 3 + i } });

test("samples with no multi-element analysis are set aside before the 90 % rule", () => {
  const samples = [...Array.from({ length: 87 }, (_, i) => icp(i)), ...Array.from({ length: 13 }, () => ({ values: { Au: 0.02 } }))];
  const c = elementCoverage(samples, els, units);
  assert.equal(c.base, 87); assert.equal(c.setAside, 13);
  assert.deepEqual(c.symbols, ["Au", "Cu", "Zn", "Pb", "As"]); // As: 82 of 87 = 94 %
  assert.deepEqual(usableElements(samples, els, units), c.symbols);
  // the old rule over all 100 samples ticked only Au (Cu, Zn, Pb at 87 %)
});

test("an element missing from many multi-element samples is still left unticked; nothing at all -> none", () => {
  const samples = Array.from({ length: 50 }, (_, i) => ({ values: { Au: 1, Cu: 2, Zn: 3, Pb: i < 25 ? 4 : undefined } }));
  assert.deepEqual(elementCoverage(samples, els, units).symbols, ["Au", "Cu", "Zn"]);
  assert.deepEqual(elementCoverage([], els, units), { symbols: [], base: 0, setAside: 0 });
});

test("the panel uses it and says what was set aside", () => {
  const p = readFileSync(new URL("../src/components/DomainsPanel.jsx", import.meta.url), "utf8");
  assert.match(p, /const coverage = useMemo\(\(\) => elementCoverage\(subset, surfaceElements, units\)/);
  assert.match(p, /coverage\.setAside > 0 && coverage\.base > 0/);
});
