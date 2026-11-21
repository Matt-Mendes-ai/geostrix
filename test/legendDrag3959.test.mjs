// TASKS.csv #3959 part C (Matt: "rearrange it") — drag and drop of a legend's rows and whole groups, in the sidebar and on the sheet; the split
// parts placed clear of the page's other elements. Made-up rows.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { moveLegendRow, moveLegendGroup, splitLegendByGroup } from "../src/lib/legendColumns.js";

const read = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const H = (n) => [n, null, { heading: true }];
const items = [H("Lithology"), ["AND", "#1"], ["BAS", "#2"], H("Alteration"), ["SER", "#3"], H("Veins"), ["QV", "#4"]];
const names = (l) => l.map((r) => r[0]);

test("a row dragged onto another lands before it; onto the end, after the last; across groups too", () => {
  assert.deepEqual(names(moveLegendRow(items, 2, 1)), ["Lithology", "BAS", "AND", "Alteration", "SER", "Veins", "QV"]);
  assert.deepEqual(names(moveLegendRow(items, 1, 3)), ["Lithology", "BAS", "AND", "Alteration", "SER", "Veins", "QV"], "before the next heading: last of its group");
  assert.deepEqual(names(moveLegendRow(items, 1, 7)), ["Lithology", "BAS", "Alteration", "SER", "Veins", "QV", "AND"], "the end");
  assert.deepEqual(names(moveLegendRow(items, 4, 1)), ["Lithology", "SER", "AND", "BAS", "Alteration", "Veins", "QV"], "into another group");
  assert.equal(moveLegendRow(items, 2, 2), items, "onto itself: nothing");
  assert.equal(moveLegendRow(items, 2, 3), items, "just after itself: nothing");
});

test("a heading dragged takes its whole group, before the group the target row is in, or to the end", () => {
  assert.deepEqual(names(moveLegendRow(items, 5, 0)), ["Veins", "QV", "Lithology", "AND", "BAS", "Alteration", "SER"]);
  assert.deepEqual(names(moveLegendRow(items, 0, 4)), ["Alteration", "SER", "Lithology", "AND", "BAS", "Veins", "QV"], "dragged down onto Alteration's row: after Alteration");
  assert.deepEqual(names(moveLegendRow(items, 5, 4)), ["Lithology", "AND", "BAS", "Veins", "QV", "Alteration", "SER"], "dragged up onto Alteration's row: before Alteration");
  assert.deepEqual(names(moveLegendGroup(items, 0, items.length)), ["Alteration", "SER", "Veins", "QV", "Lithology", "AND", "BAS"], "the end");
  assert.equal(moveLegendGroup(items, 3, 4), items, "onto itself: nothing");
  const before = items.map((r) => r);
  moveLegendRow(items, 5, 0);
  assert.deepEqual(items, before, "the list itself is not changed");
});

test("the split parts go clear of the page's other elements when there is room, else at least on the paper", () => {
  const legend = { id: "L", type: "legend", x: 600, y: 100, items };
  const size = (rows) => ({ w: 150, h: 20 + rows.length * 17 });
  const section = { x: 40, y: 100, w: 600, h: 300 }; // over the legend's left, as a snapshot beside it
  const parts = splitLegendByGroup(legend, { size, pageW: 1123, pageH: 794, obstacles: [section] });
  const overlaps = (p, o, h) => p.x < o.x + o.w && p.x + 150 > o.x && p.y < o.y + o.h && p.y + h > o.y;
  parts.forEach((p) => assert.ok(!overlaps(p, section, size(p.items).h), JSON.stringify([p.x, p.y])));
  const full = { x: 0, y: 0, w: 1123, h: 794 }; // nowhere clear: on the paper all the same
  const stuck = splitLegendByGroup(legend, { size, pageW: 1123, pageH: 794, obstacles: [full] });
  assert.ok(stuck.every((p) => p.x + 150 <= 1103 && p.y >= 0));
});

test("wired: the sidebar's grips and drop targets, the sheet's grips on the selected legend, one setElements, the split's obstacles", () => {
  const l = read("modules/LayoutModule.jsx");
  assert.match(l, /<span draggable data-legend-grip=\{i\}/);
  assert.match(l, /onDrop=\{\(e\) => \{ e\.preventDefault\(\); const from = legendDrag\.current; legendDrag\.current = null; moveLegendRowOf\(sel, from, i\); \}\}/);
  assert.match(l, /data-legend-drop-end=""/);
  assert.match(l, /setElements\(\(els\) => els\.map\(\(x\) => \(x\.id === el\.id \? \{ \.\.\.x, items, \.\.\.keptOrder\(x, items\) \} : x\)\)\);/, "one edit, the set code order kept");
  assert.match(l, /if \(!handles \|\| !onLegendMove \|\| ix\[0\] >= \(el\.items \|\| \[\]\)\.length\) return body;/, "the sheet's grips: the selected legend only, not the print copy, not the note row");
  assert.match(l, /<span draggable data-sheet-grip=\{ix\[0\]\}/);
  assert.match(l, /onLegendMove=\{moveLegendRowOf\}/);
  assert.match(l, /const obstacles = elements\.filter\(\(e\) => e\.id !== el\?\.id\)\.map\(elementBox\);/);
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const loc = JSON.parse(readFileSync(new URL(`../src/locales/${lang}.json`, import.meta.url), "utf8"));
    assert.ok(loc["Drag to move this row; a group heading moves its whole group"], lang);
  }
});
