// TASKS.csv #1482 — a new Layout legend puts surface samples and grades ahead of interval logs
import { test } from "node:test";
import assert from "node:assert/strict";
import { rankLegendGroups, legendGroupCount, firstLegendGroups } from "../src/lib/legendGroups.js";

const H = (name) => [name, null, { heading: true }];
test("samples and assay grades first, logs last, order kept within a rank", () => {
  const items = [H("Lithology"), ["LMST", "#00f"], H("Alteration"), ["SER", "#ff0"], H("Structures"), ["FLT", "#f00"], H("Surface samples"), ["rock chip", "#c00"], H("Zn (%)"), ["> 2 %", "#900"]];
  const r = rankLegendGroups(items).filter((it) => it[2]?.heading).map((it) => it[0]);
  assert.deepEqual(r, ["Surface samples", "Zn (%)", "Structures", "Lithology", "Alteration"]);
  assert.equal(legendGroupCount(items), 5);
  const long = [H("Surface samples"), ...Array.from({ length: 3 }, (_, i) => [`m${i}`, "#000"]), H("Lithology"), ...Array.from({ length: 40 }, (_, i) => [`L${i}`, "#000"])];
  assert.equal(legendGroupCount(firstLegendGroups(rankLegendGroups(long))), 1, "the long log group is the one left out");
});
