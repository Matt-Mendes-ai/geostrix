// TASKS.csv #2307 — a legend on a page with no samples or grades lists the main logs (lithology, alteration) before the small layers;
// with samples or grades, #1482's order holds
import test from "node:test";
import assert from "node:assert/strict";
import { rankLegendGroups, firstLegendGroups, legendGroupCount } from "../src/lib/legendGroups.js";

const H = (name) => [name, null, { heading: true }];
const heads = (items) => items.filter((it) => it[2]?.heading).map((it) => it[0]);

test("the review's drill page: Lithology and Alteration first", () => {
  const items = [H("Mineralization"), ["PY", "#ff0"], H("Structure planes"), ["VN", "#f00"], H("Geotech (RQD%)"), ["0-100", "#000"], H("Lithology"), ["BIF", "#00f"], H("Alteration"), ["SER", "#0f0"]];
  assert.deepEqual(heads(rankLegendGroups(items)), ["Lithology", "Alteration", "Mineralization", "Structure planes", "Geotech (RQD%)"]);
  const kept = firstLegendGroups(rankLegendGroups(items));
  assert.ok(heads(kept)[0] === "Lithology" && legendGroupCount(kept) >= 1);
});

test("with a samples or grade group, #1482's order is unchanged", () => {
  const items = [H("Lithology"), ["LMST", "#00f"], H("Structures"), ["FLT", "#f00"], H("Zn (%)"), ["> 2 %", "#900"]];
  assert.deepEqual(heads(rankLegendGroups(items)), ["Zn (%)", "Structures", "Lithology"]);
});
