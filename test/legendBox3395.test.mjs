// TASKS.csv #3395 — a Layout legend with a height and a number of columns: its rows fill the columns top to bottom, a heading stays with its
// first row, '+ n more' only when the box is still too small; a legend with neither lays out as before
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { legendBoxFit, isLegendBox, legendRowH, legendLabelW } from "../src/lib/legendFit.js";

// SYNTHETIC: Matt's page shape — a Lithology group (12 codes) and a 55-class mag susc model
const items = [["Lithology", null, { heading: true }], ...Array.from({ length: 12 }, (_, i) => [`Unit ${i}`, "#888"]),
  ["MagSusc (SI)", null, { heading: true }], ...Array.from({ length: 55 }, (_, i) => [`${i}e-5 – ${i + 1}e-5`, "#446"])];
const o = { rowH: legendRowH, labelW: legendLabelW, pageH: 1123 };
const rowsH = items.reduce((t, it) => t + legendRowH(it), 0);

test("a box is a legend with a height or a chosen column count", () => {
  assert.equal(isLegendBox({ type: "legend" }), false);
  assert.equal(isLegendBox({ type: "legend", legendCols: "auto" }), false);
  assert.equal(isLegendBox({ type: "legend", h: 300 }), true);
  assert.equal(isLegendBox({ type: "legend", legendCols: 3 }), true);
});

test("tall enough for three columns: every row shows", () => {
  const f = legendBoxFit(items, { ...o, boxW: 560, boxH: Math.ceil(rowsH / 3) + 40 + 60, cols: 3 });
  assert.deepEqual([f.cols, f.left, f.box], [3, 0, true]);
});

test("too short: only what does not fit is left out, never ending on a heading, the note has room", () => {
  const boxH = 260, f = legendBoxFit(items, { ...o, boxW: 560, boxH, cols: 2 });
  assert.ok(f.left > 0 && f.shown > 0);
  assert.equal(f.shown + f.left, items.length);
  assert.ok(!items[f.shown - 1][2]?.heading, "the last row shown is not a heading");
  // pour the shown rows the way the box does (a heading with its next row) and check they fit two columns of boxH - 40 with the note
  const colH = boxH - 40; let c = 0, used = 0;
  for (let i = 0; i < f.shown; i++) {
    const h = items[i][2]?.heading ? legendRowH(items[i]) + legendRowH(items[++i]) : legendRowH(items[i]);
    if (used > 0 && used + h > colH) { c++; used = 0; }
    used += h;
  }
  assert.ok(c < 2 && (c < 1 || used + 16 <= colH), `fits: column ${c}, ${used} px used`);
  // one more column takes more rows
  assert.ok(legendBoxFit(items, { ...o, boxW: 760, boxH, cols: 3 }).shown > f.shown);
});

test("Auto takes as many columns as the rows need, as many as the width holds", () => {
  const tall = legendBoxFit(items, { ...o, boxW: 900, boxH: rowsH + 200 });
  assert.equal(tall.cols, 1, "one column holds them all");
  const short = legendBoxFit(items, { ...o, boxW: 900, boxH: Math.ceil(rowsH / 3) + 80 });
  assert.deepEqual([short.cols, short.left], [3, 0], "a third of the height: three columns, no more");
  const narrow = legendBoxFit(items, { ...o, boxW: 360, boxH: 300 });
  assert.equal(narrow.cols, 2, "360 px holds two 150 px columns (2 x 150 + 18 gap + 24 padding = 342)");
  assert.equal(legendBoxFit(items, { ...o, boxW: 340, boxH: 300 }).cols, 1);
  assert.ok(narrow.left > 0);
});

test("wired: the element, its handles, the sidebar, the pre-flight", () => {
  const m = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");
  assert.match(m, /if \(isLegendBox\(el\)\) return legendBoxFit\(el\.items \|\| \[\], \{ \.\.\.o, boxW: Number\(el\.w\) \|\| null, boxH: Number\(el\.h\) \|\| null, cols: el\.legendCols \?\? null \}\);/);
  assert.match(m, /legend: \["e", "w", "s", "se"\]/);
  assert.match(m, /widthOnly: WIDTH_ONLY\.has\(el\.type\) && !\(el\.type === "legend" && handle\.includes\("s"\)\)/);
  assert.match(m, /columnFill: boxH \? "auto" : "balance"/);
  assert.match(m, /<div key=\{ix\[0\]\} style=\{\{ breakInside: "avoid" \}\}>/);
  assert.match(m, /aria-label=\{tr\("Legend height \(mm\)"\)\}/);
  assert.match(m, /aria-label=\{tr\("Legend columns"\)\}/);
  assert.match(m, /perGroup: perGroup \?\? legend\.codesPerLayer \?\? \(isLegendBox\(legend\) \? "all" : 12\)/);
  assert.match(m, /tr\("Legend: \{n\} row\(s\) left out, its box is too small", \{ n: f\.left \}\)/);
});
