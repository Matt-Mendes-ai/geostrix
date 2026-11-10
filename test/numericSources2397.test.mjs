// TASKS.csv #2397 / #2421 (review #2325, WA uranium) — the numeric source list: imported logs first with their unit, no bin counts, evaluated
// models last (and not an Estimation source)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { numericSourceChoices, CUSTOM_UNIT } from "../src/lib/numericSources.js";

const rows = (n, f) => Array.from({ length: n }, (_, i) => ({ hole_id: `H${i % 5}`, from: i, to: i + 1, ...f(i) }));
const customLayers = [
  { id: 1, name: "Drilling method", rows: rows(27, (i) => ({ value: "AC", casing_depth: i % 7 })) }, // a coded layer with one numeric field
  { id: 2, name: "Gamma: eU3O8_cased_ppm", unit: "ppm", binM: 0.5, rows: rows(400, (i) => ({ value: i % 90, min: i % 50, max: i % 120, n: 3 })) },
  { id: 3, name: "On holes: U estimate", sourceModel: "vox1", unit: "ppm", rows: rows(60, (i) => ({ value: i })) },
];

test("the gamma log first, in ppm, with no '› n'; the casing depth after; the evaluated model last", () => {
  const ch = numericSourceChoices({ layers: {}, customLayers });
  assert.equal(ch[0].label, "Gamma: eU3O8_cased_ppm");
  assert.equal(ch[0].unit, "ppm");
  assert.ok(ch.find((c) => c.label === "Gamma: eU3O8_cased_ppm › max").unit === "ppm");
  assert.equal(ch.some((c) => c.label.endsWith("› n")), false);
  assert.equal(ch.find((c) => c.label === "Drilling method › casing_depth").unit, CUSTOM_UNIT);
  assert.equal(ch[ch.length - 1].label, "On holes: U estimate");
  assert.equal(ch.some((c) => "_log" in c || "_name" in c), false);
});

test("Estimation leaves the evaluated model out", () => {
  const ch = numericSourceChoices({ layers: {}, customLayers, models: false });
  assert.equal(ch.some((c) => c.label.startsWith("On holes:")), false);
  const g = readFileSync(new URL("../src/components/GradeEstimationModal.jsx", import.meta.url), "utf8");
  assert.equal((g.match(/numericSourceChoices\(\{ layers, customLayers, models: false/g) || []).length, 2);
});

test("the WA sample's gamma log carries its unit", () => {
  const s = readFileSync(new URL("../src/lib/sampleWaUranium.js", import.meta.url), "utf8");
  assert.match(s, /name: WA_URANIUM_GAMMA_LAYER, rows, unit: "ppm"/);
});
