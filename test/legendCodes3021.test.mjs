// TASKS.csv #3021 (review #2876, WA iron) — a legend loaded from a view listed 12 codes per layer ('+ 22 more codes, not listed', the footwall
// JER among them); the legend's own 'Codes per layer' (12 / 24 / all) now sets it, and a long key flows into columns (legendFit, #1480)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { capLegendGroups } from "../src/lib/legendGroups.js";

const codes = Array.from({ length: 34 }, (_, i) => `C${i}`);
const group = { label: "Lithology", items: codes.map((c) => [c, "#123456"]), counts: codes.map((_, i) => 1000 - i) };
const more = (n) => `+ ${n} more codes, not listed`;

test("12, 24 and all codes of a 34-code layer", () => {
  const twelve = capLegendGroups([group], 12, more)[0].items;
  assert.equal(twelve.length, 13); assert.equal(twelve[12][0], "+ 22 more codes, not listed");
  const t24 = capLegendGroups([group], 24, more)[0].items;
  assert.equal(t24.length, 25); assert.equal(t24[24][0], "+ 10 more codes, not listed");
  const all = capLegendGroups([group], Infinity, more)[0].items;
  assert.equal(all.length, 34); assert.ok(!all.some((r) => /more codes/.test(r[0])));
});

test("wiring: the legend's codesPerLayer reaches the load, and the sidebar sets it and reloads", () => {
  const g = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");
  assert.match(g, /capLegendGroups\((?:applyCodeOrder\()?mergeCaseTwins\(groups\)(?:, orders\) \/\* #3130 \*\/)?, perGroup === "all" \? Infinity : Number\(perGroup\) \|\| 12,/);
  assert.match(g, /perGroup: perGroup \?\? legend\.codesPerLayer \?\? 12/);
  assert.match(g, /updateSelected\(\{ codesPerLayer: v \}\); syncLegendFromView\(sel\.id, \{ perGroup: v \}\);/);
});
