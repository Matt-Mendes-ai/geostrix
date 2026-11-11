// TASKS.csv #1043 -> #1128 / #1127 — the section key goes to Layout as a legend element, its rows grouped by layer
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { groupSectionLegend } from "../src/lib/sectionLegend.js";

test("#1127 rows are grouped under a heading per layer, the prefix taken off each row", () => {
  const items = [["Alteration: Phyllic", "#a"], ["Lithology: Andesite", "#b"], ["Lithology: Diorite", "#c"], ["Structure planes: FRAC", "#d"]];
  assert.deepEqual(groupSectionLegend(items), [
    ["Alteration", null, { heading: true }], ["Phyllic", "#a"],
    ["Lithology", null, { heading: true }], ["Andesite", "#b"], ["Diorite", "#c"],
    ["Structure planes", null, { heading: true }], ["FRAC", "#d"]]);
  assert.deepEqual(groupSectionLegend(groupSectionLegend(items)), groupSectionLegend(items)); // safe twice
});

test("#1127 one group: no heading, just the names", () => {
  assert.deepEqual(groupSectionLegend([["Lithology: Andesite", "#b"], ["Lithology: Diorite", "#c"]]), [["Andesite", "#b"], ["Diorite", "#c"]]);
  assert.deepEqual(groupSectionLegend(null), []);
});

test("#1128 the section window draws no key; a Layout snapshot gets a bound legend", () => {
  const sw = fs.readFileSync("src/components/SectionWindow.jsx", "utf8");
  assert.doesNotMatch(sw, /sectionLegendLayout|showLegend/);
  assert.match(sw, /groupSectionLegend\(\[\.\.\.sectionAssayLegend\(data\.points, data\.assayLegend\), \.\.\.shownLegendItems,/); // #1475: grade classes first
  assert.match(sw, /legendItems: keyRows\(true\)/); // #2523: one builder for the snapshot and the key under the drawing (still none IN the drawing)
  const lm = fs.readFileSync("src/modules/LayoutModule.jsx", "utf8");
  assert.match(lm, /const items = groupSectionLegend\(a\.legendItems\);/); // #2612: placed on the sheet before it is returned
  assert.match(lm, /type: "legend", \.\.\.spot, items, boundViewportId: a\.id/);
});
