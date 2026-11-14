// TASKS.csv #3305 (#3260's follow-up, Galore Creek: Cu classes '≤ 460 / 460–6590 / 6590–16600 / > 16600 ppm') — a ppm element whose values
// run into the thousands (its P90 over 1,000 ppm) reads in per cent in the legend; a trace element stays in ppm.
import test from "node:test";
import assert from "node:assert/strict";
import { assayLegendGroups, ppmAsPercent } from "../src/lib/legendGroups.js";

const samples = (vals) => vals.map((v) => ({ values: { Cu: v, Au: v / 10000 } }));
const elements = [{ symbol: "Cu", unit: "ppm" }, { symbol: "Au", unit: "g/t" }];
const breaks = [{ max: 460, color: "#eee" }, { max: 6590, color: "#c80" }, { max: 16600, color: "#800" }, { max: 99999, color: "#400" }];

test("P90 over 1,000 ppm: the classes and the heading in per cent", () => {
  const a = samples([...Array(80).fill(300), ...Array(20).fill(5000)]); // 20 % over 1,000 ppm
  assert.equal(ppmAsPercent(a, "Cu", "ppm"), true);
  const [g] = assayLegendGroups({ assays: a, assayElements: elements, assayVisible: true, assayDisplayElements: ["Cu"], assayStyle: { Cu: { breaks, minCutoff: 100 } } });
  assert.equal(g.label, "Cu (%)");
  assert.deepEqual(g.items.map(([l]) => l), ["≤ 0.046 %", "0.046–0.66 %", "0.66–1.66 %", "> 1.66 %", "below 0.010 % hidden"]);
});

test("a trace element (10 % or fewer over 1,000 ppm), another unit, no samples: unchanged", () => {
  const a = samples([...Array(90).fill(300), ...Array(10).fill(5000)]); // exactly 10 %
  assert.equal(ppmAsPercent(a, "Cu", "ppm"), false);
  const [g] = assayLegendGroups({ assays: a, assayElements: elements, assayVisible: true, assayDisplayElements: ["Cu"], assayStyle: { Cu: { breaks } } });
  assert.equal(g.label, "Cu (ppm)");
  assert.equal(g.items[1][0], "460.0–6590 ppm");
  assert.equal(ppmAsPercent(samples(Array(50).fill(50000)), "Au", "g/t"), false, "only ppm");
  assert.equal(ppmAsPercent([], "Cu", "ppm"), false);
});

test("kept per samples array and element", () => {
  const a = samples([...Array(5).fill(300), ...Array(5).fill(5000)]);
  assert.equal(ppmAsPercent(a, "Cu", "ppm"), true);
  a.forEach((r) => { r.values.Cu = 1; }); // the store replaces the array on a change; the same array answers as before
  assert.equal(ppmAsPercent(a, "Cu", "ppm"), true);
  assert.equal(ppmAsPercent([...a], "Cu", "ppm"), false);
});
