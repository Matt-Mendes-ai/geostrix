// TASKS.csv #1480 / #1637 — a long bound legend (a strip log's or a section's 40+ rows) ran past the bottom of the page
import { legendFit } from "../src/lib/legendFit.js"; // #2134
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const s = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");

test("a legend flows into up to 4 columns to end above the sheet's foot", () => {
  // #2134 — the arithmetic moved into lib/legendFit.js (also held to the room on the right): the same up-to-4 columns from the foot
  assert.match(s, /return legendFit\(el\.items \|\| \[\], \{ \.\.\.o, x: Number\(el\.x\) \|\| 0, pageW \}\);/); // #3395: legendLayout(el, pageW, pageH), o = { rowH, labelW, pageH, y }
  assert.match(s, /legendLayout\(el, ctx\?\.pageW \|\| 1123, ctx\?\.pageH \|\| 794\)/);
  const items = Array.from({ length: 120 }, (_, k) => [`u${k}`, "#888"]);
  assert.equal(legendFit(items, { x: 40, y: 40, rowH: () => 17, labelW: () => 40 }).cols, 3); // 2,080 px of rows over 724 px of room
  assert.match(s, /<div style=\{legendCols > 1 \|\| box \? \{ columnCount: legendCols, columnGap: 18, columnFill: boxH \? \"auto\" : \"balance\"/ /* #3395: a sized box fills top to bottom */);
  assert.match(s, /pageH: pagePx\(pageFormatOf\(page\)\)\.h, pageW/);
});

test("a row and a ramp are never split between columns, and a heading never ends one", () => {
  assert.match(s, /breakAfter: "avoid" \/\* #1480 — a heading never ends a column \*\//);
  assert.match(s, /marginBottom: 3, breakInside: "avoid" \/\* #1480/);
  assert.match(s, /<div key=\{i\} style=\{\{ marginBottom: 4, breakInside: "avoid" \}\}>/);
});
