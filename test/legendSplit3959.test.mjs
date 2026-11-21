// TASKS.csv #3959 part B (Matt: "split the legend into columns and rearrange it") — 'Split into one legend per group' and 'Join legends'.
// Made-up rows.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { legendGroupsOf, keepGroups, splitLegendByGroup, joinLegends, toggleColumnBreak, startsColumn } from "../src/lib/legendColumns.js";

const read = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const H = (n) => [n, null, { heading: true }];
const items = [H("Lithology"), ["AND — andesite", "#111"], ["BAS — basalt", "#222"], H("Alteration"), ["SER — sericite", "#333"], H("Veins"), ["QV — quartz vein", "#444"]];
const legend = { id: "leg1", type: "legend", x: 100, y: 50, w: 300, h: 400, legendCols: 2, boundViewportId: "vp1", items };
const size = (rows) => ({ w: 160, h: 30 + rows.length * 17 });

test("a legend's groups: a heading and its rows; rows before any heading are a group with no name", () => {
  assert.deepEqual(legendGroupsOf(items).map((g) => [g.label, g.rows.length]), [["Lithology", 3], ["Alteration", 2], ["Veins", 2]]);
  assert.deepEqual(legendGroupsOf([["A", "#1"], H("G"), ["B", "#2"]]).map((g) => g.label), [null, "G"]);
  assert.deepEqual(keepGroups(items, ["Veins", "Lithology"]).map((r) => r[0]), ["Lithology", "AND — andesite", "BAS — basalt", "Veins", "QV — quartz vein"]);
  assert.equal(keepGroups(items, null), items);
});

test("split: one legend per group, bound to the same view, side by side; each keeps its group's name and starts its own size again", () => {
  const parts = splitLegendByGroup({ ...legend, items: toggleColumnBreak(items, 3) }, { size, pageW: 1123, newId: (i) => `leg1_${i}` });
  assert.equal(parts.length, 3);
  assert.deepEqual(parts.map((p) => p.id), ["leg1", "leg1_1", "leg1_2"], "the first keeps the legend's id");
  assert.ok(parts.every((p) => p.boundViewportId === "vp1" && p.type === "legend"));
  assert.deepEqual(parts.map((p) => p.groupsShown), [["Lithology"], ["Alteration"], ["Veins"]]);
  assert.deepEqual(parts.map((p) => [p.x, p.y]), [[100, 50], [272, 50], [444, 50]], "a row of them, 12 px apart");
  assert.ok(parts.every((p) => p.h === undefined && p.legendCols === undefined));
  assert.equal(startsColumn(parts[1].items[0]), false, "a break that started a group's column is not kept on a legend of its own");
  const narrow = splitLegendByGroup(legend, { size, pageW: 500 });
  assert.equal(narrow[2].x, 100, "past the paper's edge: the next row");
  assert.ok(narrow[2].y > 50);
  assert.equal(splitLegendByGroup({ ...legend, items: items.slice(0, 3) }, { size }), null, "one group: nothing to split");
  // a legend low and to the right of an A4 landscape page (as a section snapshot's): the parts would run off the paper's bottom, so they move
  // left / up until every one is on the paper
  const tall = (rows) => ({ w: 280, h: 40 + rows.length * 60 });
  const low = splitLegendByGroup({ ...legend, x: 614, y: 130 }, { size: tall, pageW: 1123, pageH: 794 });
  assert.ok(low.every((p, i) => p.x >= 20 && p.x + 280 <= 1103 && p.y >= 20 && p.y + tall(low[i].items).h <= 774), JSON.stringify(low.map((p) => [p.x, p.y])));
});

test("join: the split legends back into one, in reading order, at the first one's place; the others go", () => {
  const parts = splitLegendByGroup(legend, { size, newId: (i) => `leg1_${i}` });
  const r = joinLegends([parts[2], parts[0], parts[1]]);
  assert.equal(r.joined.id, "leg1");
  assert.deepEqual(r.joined.items.map((x) => x[0]), items.map((x) => x[0]), "the rows in their order again");
  assert.equal(r.joined.groupsShown, undefined, "Load from view fills it with every group again");
  assert.deepEqual(r.removed.sort(), ["leg1_1", "leg1_2"]);
  assert.equal(joinLegends([parts[0]]), null);
});

test("wired: the two buttons, one setElements each (one undo step), and Load from view refilling a split legend with its own groups", () => {
  const l = read("modules/LayoutModule.jsx");
  assert.match(l, /data-legend-split="" onClick=\{splitSelectedLegend\}/);
  assert.match(l, /data-legend-join="" onClick=\{joinSelectedLegend\}/);
  assert.match(l, /setElements\(\(els\) => els\.flatMap\(\(x\) => \(x\.id === el\.id \? parts : \[x\]\)\)\);/);
  assert.match(l, /setElements\(\(els\) => els\.filter\(\(x\) => !gone\.has\(x\.id\)\)\.map\(\(x\) => \(x\.id === r\.joined\.id \? r\.joined : x\)\)\);/);
  assert.match(l, /const items = keepGroups\(all, legend\?\.groupsShown\);/);
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const loc = JSON.parse(readFileSync(new URL(`../src/locales/${lang}.json`, import.meta.url), "utf8"));
    for (const k of ["Split into one legend per group", "Join legends", "Joined {n} legends into one."]) assert.ok(loc[k], `${lang}: ${k}`);
  }
});
