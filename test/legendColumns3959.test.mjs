// TASKS.csv #3959 (Matt's first-time test: "I want to be able to split the legend into columns and rearrange it") — part A: the column
// count in view (sidebar buttons and a bar on the selected legend), a column break on any row, kept by 'Load from view / section'; and
// #3945's 'CODE — rock name' rows no longer counted as long descriptions. Made-up rows.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { toggleColumnBreak, clearColumnBreaks, hasColumnBreaks, startsColumn, carryColumnBreaks } from "../src/lib/legendColumns.js";
import { legendBoxFit, isLegendBox } from "../src/lib/legendFit.js";
import { groupSectionLegend, LONG_VALUE } from "../src/lib/sectionLegend.js";

const read = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const rows = () => [["Lithology", null, { heading: true }], ["AND — andesite", "#111"], ["BAS — basalt", "#222"], ["Alteration", null, { heading: true }], ["SER — sericite", "#333", { pattern: "x" }], ["CHL — chlorite", "#444"]];

test("a break on a row, off again; the first row never takes one; its other options are kept", () => {
  const r = rows();
  const a = toggleColumnBreak(r, 3);
  assert.ok(startsColumn(a[3]) && a[3][2].heading, "a heading keeps its heading flag");
  assert.equal(a[0], r[0]); assert.equal(a[1], r[1]); // the others: the same rows
  const b = toggleColumnBreak(a, 4);
  assert.deepEqual(b[4][2], { pattern: "x", colBreak: true });
  assert.ok(hasColumnBreaks(b));
  assert.deepEqual(toggleColumnBreak(b, 4)[4], r[4], "off: as it was");
  assert.deepEqual(toggleColumnBreak(r, 1)[1], ["AND — andesite", "#111", { colBreak: true }]);
  assert.deepEqual(toggleColumnBreak(toggleColumnBreak(r, 1), 1)[1], ["AND — andesite", "#111"], "a row with no options gets none back");
  assert.equal(toggleColumnBreak(r, 0), r, "the first row starts the first column");
  assert.deepEqual(clearColumnBreaks(b), r);
});

test("the fit: a break starts a new column (Auto takes as many as the breaks need); a legend with a break is a box", () => {
  const rowH = (it) => (it?.[2]?.heading ? 20 : 17), labelW = () => 100;
  const r = rows();
  assert.equal(legendBoxFit(r, { rowH, labelW, pageH: 794 }).cols, 1, "no break: one column fits");
  const broken = toggleColumnBreak(r, 3);
  const f = legendBoxFit(broken, { rowH, labelW, pageH: 794 });
  assert.equal(f.cols, 2); assert.equal(f.left, 0);
  const two = legendBoxFit(toggleColumnBreak(broken, 5), { rowH, labelW, pageH: 794, cols: 2 });
  assert.equal(two.left, 1, "three columns asked by the breaks in a 2-column box: the last row does not fit, and is counted");
  assert.equal(isLegendBox({ items: broken }), true);
  assert.equal(isLegendBox({ items: r }), false);
});

test("Load from view keeps the breaks on the rows of the same label; a row gone takes its break with it", () => {
  const old = toggleColumnBreak(toggleColumnBreak(rows(), 3), 2);
  const fresh = [["Lithology", null, { heading: true }], ["AND — andesite", "#111"], ["Alteration", null, { heading: true }], ["CHL — chlorite", "#444"]];
  const kept = carryColumnBreaks(old, fresh);
  assert.ok(startsColumn(kept[2]), "the Alteration heading still starts a column");
  assert.equal(kept.filter(startsColumn).length, 1, "BAS is gone, and its break");
  assert.equal(carryColumnBreaks(rows(), fresh), fresh, "no breaks: the loaded rows as they are");
});

test("#3945's rows ('CODE — rock name', five words at most) are listed; a long free-text description is still left out", () => {
  const name = "QSP — quartz sericite pyrite altered andesite"; // 45 characters: left out at 40
  assert.ok(name.length > 40 && name.length <= LONG_VALUE);
  const out = groupSectionLegend([[`Lithology: ${name}`, "#111"], ["Lithology: pyrite disseminated in quartz-carbonate veinlets with minor chalcopyrite and sphalerite along fractures", "#222"]]);
  assert.ok(out.some((r) => r[0] === name), "the short name is listed");
  assert.equal(out.filter((r) => r[2]?.note).length, 1, "the long one still makes the note");
});

test("wired: the column buttons (sidebar and sheet), the break toggle on each row, Clear, the break drawn, and Load from view keeping them", () => {
  const l = read("modules/LayoutModule.jsx");
  assert.match(l, /data-legend-cols-side=""/);
  assert.match(l, /onClick=\{\(\) => setLegendColsFor\(sel, v === "auto" \? undefined : Number\(v\)\)\}/);
  assert.doesNotMatch(l, /<select value=\{String\(sel\.legendCols/, "the select is gone");
  assert.match(l, /\{handles && onLegendCols && \(/);
  assert.match(l, /data-legend-cols-sheet=""/);
  assert.match(l, /onLegendCols=\{setLegendColsFor\}/);
  assert.match(l, /const setLegendColsFor = \(el, v\) => \{\n {4}const was = isLegendBox\(el\);/);
  assert.match(l, /onClick=\{\(\) => updateSelected\(\{ items: toggleColumnBreak\(sel\.items, i\) \}\)\}/);
  assert.match(l, /updateSelected\(\{ items: clearColumnBreaks\(sel\.items\) \}\)/);
  assert.match(l, /startsColumn\(legendItems\[ix\[0\]\]\) \? <div key=\{ix\[0\]\} style=\{\{ breakBefore: "column" \}\}>/);
  assert.match(l, /items: carryColumnBreaks\(legend\?\.items, items\)/);
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const loc = JSON.parse(readFileSync(new URL(`../src/locales/${lang}.json`, import.meta.url), "utf8"));
    for (const k of ["Start a new column here", "Join this row to the column before", "Clear column breaks"]) assert.ok(loc[k], `${lang}: ${k}`);
  }
});
