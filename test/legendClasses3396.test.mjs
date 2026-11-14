// TASKS.csv #3396 — a quantile-classified mag susc model whose breaks repeat near zero: no '0.000010 – 0.000010' rows, bounds that read
// differently, and its classes not cut to 12 as if they were codes
import test from "node:test";
import assert from "node:assert/strict";
import { legendScale, distinctBoundFormat } from "../src/lib/legendScale.js";
import { scaleLegendGroup, capLegendGroups, fmtLegendValue } from "../src/lib/legendGroups.js";
import { colorForVoxelValue } from "../src/lib/layers.js";

// SYNTHETIC: 20 quantile breaks of a field with most cells at 1e-5; the first six land on the same value
const breaks = [1e-5, 1e-5, 1e-5, 1e-5, 1e-5, 1e-5, 1.2e-5, 1.5e-5, 2.1e-5, 3e-5, 4.4e-5, 0.0001, 0.00025, 0.0007, 0.0021, 0.0063, 0.019, 0.055, 0.16, 0.48];
const model = { colorMode: "discrete", stops: breaks.map((v, i) => ({ value: v, color: `#${(16 + i * 11).toString(16).padStart(2, "0")}3344` })), min: 0, max: 0.9 };

test("classes with equal bounds are left out, and they are the ones nothing is drawn in", () => {
  const L = legendScale(model, 0, 0.9, fmtLegendValue);
  assert.equal(L.kind, "classes");
  assert.equal(L.items.length, 20 - 4, "six equal breaks: four zero-width classes dropped");
  // the drawn colour at the repeated break is the kept class's
  const at = colorForVoxelValue(model, 1e-5), row = L.items.find(([, c]) => c === at);
  assert.ok(row, "the colour drawn at 1e-5 has its row");
  for (const [label] of L.items) { const m = /^(.+) – (.+)$/.exec(label); if (m) assert.notEqual(m[1], m[2], label); }
});

test("bounds read differently: more figures, or scientific notation for tiny values", () => {
  const L = legendScale(model, 0, 0.9, fmtLegendValue);
  const labels = L.items.map(([l]) => l);
  assert.equal(new Set(labels).size, labels.length);
  assert.ok(!labels.some((l) => l.includes("0.000010")), labels.join(" | "));
  assert.ok(labels.some((l) => l.includes("1e-5")) && labels.some((l) => l.includes("1.2e-5")), labels.join(" | "));
  // neighbours never share a label
  const f = distinctBoundFormat([1.234e-5, 1.236e-5, 0.5], fmtLegendValue);
  assert.notEqual(f(1.234e-5), f(1.236e-5));
  // values that already read differently keep the old format
  const g = distinctBoundFormat([0.1, 0.5, 2], fmtLegendValue);
  assert.equal(g, fmtLegendValue);
  const h = distinctBoundFormat([2.5e6, 2.5001e6]); // the same to 3 figures: more, in scientific notation from 1,000,000
  assert.deepEqual([h(2.5e6), h(2.5001e6)], ["2.5e6", "2.5001e6"]);
});

test("a model's classes are not cut to 12 as codes; a code layer still is", () => {
  const classes = scaleLegendGroup("voxel_m", "MagSusc", model, 0, 0.9);
  const codes = { key: "litho", label: "Lithology", items: Array.from({ length: 30 }, (_, i) => [`C${i}`, "#888"]) };
  const [c1, c2] = capLegendGroups([classes, codes], 12, (n) => `+ ${n} more codes, not listed`);
  assert.equal(c1.items.length, 16, "all 16 classes");
  assert.ok(!c1.items.some((it) => it[2]?.note));
  assert.equal(c2.items.length, 13); assert.equal(c2.items.at(-1)[0], "+ 18 more codes, not listed");
});
