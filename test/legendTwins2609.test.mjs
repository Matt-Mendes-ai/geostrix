// TASKS.csv #2609 — sheet legends: one row per colour when codes differ only by case, and a 'more codes' line without an editing hint
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mergeCaseTwins } from "../src/lib/legendCaseTwins.js";

test("the review's Weathering group: ten rows become five, under the commoner spelling, counts added", () => {
  const items = [["e", "#E69F00"], ["E", "#E69F00"], ["fr", "#5b6770"], ["FR", "#5b6770"], ["h", "#56B4E9"], ["H", "#56B4E9"]];
  const g = { label: "Weathering", items, counts: [2, 900, 5, 400, 1, 700] };
  const [m] = mergeCaseTwins([g]);
  assert.deepEqual(m.items.map((x) => x[0]), ["E", "FR", "H"]);
  assert.deepEqual(m.counts, [902, 405, 701]);
});

test("different colours, headings, notes and ramps are left alone", () => {
  const g = { items: [["a", "#111"], ["A", "#222"], ["+ 3 more codes", null, { note: true }]] };
  assert.equal(mergeCaseTwins([g])[0], g);
  const ramp = { ramp: { colors: [] } };
  assert.equal(mergeCaseTwins([ramp])[0], ramp);
});

test("wired into the Layout legend, and the 'more' line is for the reader", () => {
  const m = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");
  assert.match(m, /legendGroupsToItems\(capLegendGroups\(mergeCaseTwins\(groups\), (12|perGroup === \"all\" \? Infinity : Number\(perGroup\) \|\| 12),/); // #3021: the legend's codesPerLayer, 12 by default
  assert.match(m, /tr\("\+ \{n\} more codes, not listed", \{ n \}\)/);
  assert.doesNotMatch(m, /edit the legend to add them/);
});
