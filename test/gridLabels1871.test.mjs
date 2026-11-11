// TASKS.csv #1871 — the viewport grid's labels and caption have a white box behind them, not a stroked copy of the text: Chromium's
// printToPDF wrote the stroke as a second text run ('668833,,000000 EE'), so coordinates could not be searched in the PDF
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("no paint-order halo on the grid labels; a box behind each", () => {
  const m = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");
  const at = m.indexOf("const gridNote = crs ?");
  const grid = m.slice(at, m.indexOf("</svg>", at));
  assert.doesNotMatch(grid, /paintOrder/);
  assert.match(grid, /<rect x=\{x - 1\} y=\{y - fpx \+ 1\} width=\{estW\(l\.label\) \+ 2\}/);
  assert.match(grid, /<rect x=\{2\} y=\{H - 3 - printPx\(printPt\.caption\)\} width=\{estW\(gridNote\) \+ 2\}/);
});
