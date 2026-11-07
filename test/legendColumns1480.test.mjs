// TASKS.csv #1480 / #1637 — a long bound legend (a strip log's or a section's 40+ rows) ran past the bottom of the page
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const s = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");

test("a legend flows into up to 4 columns to end above the sheet's foot", () => {
  assert.match(s, /const est = 40 \+ \(el\.items \|\| \[\]\)\.reduce\(\(t, it\) => t \+ row\(it\), 0\), room = \(ctx\?\.pageH \|\| 794\) - \(Number\(el\.y\) \|\| 0\) - 30;/);
  assert.match(s, /return room > 80 \? Math\.min\(4, Math\.max\(1, Math\.ceil\(est \/ room\)\)\) : 1;/);
  assert.match(s, /<div style=\{legendCols > 1 \? \{ columnCount: legendCols, columnGap: 18 \} : undefined\}>/);
  assert.match(s, /pageH: pagePx\(pageFormatOf\(page\)\)\.h \}/);
});

test("a row and a ramp are never split between columns, and a heading never ends one", () => {
  assert.match(s, /breakAfter: "avoid" \/\* #1480 — a heading never ends a column \*\//);
  assert.match(s, /marginBottom: 3, breakInside: "avoid" \/\* #1480/);
  assert.match(s, /<div key=\{i\} style=\{\{ marginBottom: 4, breakInside: "avoid" \}\}>/);
});
