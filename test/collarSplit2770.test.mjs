// TASKS.csv #2770 (split from #2717) — a collar table in two table columns side by side: twice the rows per page at the same height
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { splitTableRows, tableColumnRows, continuationTables, collarTableHeight } from "../src/lib/collarTable.js";
import { elementBox } from "../src/lib/layoutPlace.js";

test("splitTableRows: down the left column, then the right", () => {
  const r = Array.from({ length: 7 }, (_, i) => [`H${i + 1}`]);
  assert.deepEqual(splitTableRows(r, 2).map((p) => p.map((x) => x[0])), [["H1", "H2", "H3", "H4"], ["H5", "H6", "H7"]]);
  assert.deepEqual(splitTableRows(r, 1), [r]);
  assert.deepEqual(splitTableRows(r, undefined), [r]);
  assert.deepEqual(splitTableRows([["H1"]], 2), [[["H1"]]], "one row: one table");
  assert.deepEqual(splitTableRows([], 2), [[]]);
});

test("a split table is as tall as half its rows, and its continuation pages step by all of them", () => {
  assert.equal(tableColumnRows({ maxRows: 80, split: 2 }), 40);
  assert.equal(tableColumnRows({ maxRows: 81, split: 2 }), 41);
  assert.equal(tableColumnRows({ maxRows: 40 }), 40);
  const el = { type: "table", source: "collars", x: 40, y: 40, w: 1040, maxRows: 80, split: 2, fontPt: 7, firstRow: 1 };
  assert.equal(elementBox(el).h, collarTableHeight(40, 7));
  assert.equal(elementBox({ ...el, split: 1 }).h, collarTableHeight(80, 7));
  // 400 holes: 80 a page instead of 40, so 4 continuation pages instead of 9
  assert.deepEqual(continuationTables(el, 400).map((t) => t.firstRow), [81, 161, 241, 321]);
  assert.equal(continuationTables({ ...el, maxRows: 40, split: 1 }, 400).length, 9);
});

test("wiring: the table renders its parts side by side; the checkbox doubles the rows and the width", () => {
  const s = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");
  assert.match(s, /const tableParts = el\.source === "collars" \? splitTableRows\(rows, el\.split\) : \[rows\];/);
  assert.match(s, /\{tableParts\.map\(\(part, pi\) => \(/);
  assert.match(s, /\{part\.map\(\(r, i\) => <tr key=\{i\}>/);
  assert.match(s, /\{more > 0 && pi === tableParts\.length - 1 && el\.source !== "samples" &&/);
  assert.match(s, /updateSelected\(on \? \{ split: 2, maxRows: lim \* 2, w: Math\.min\(A4\.w - 80, w \* 2\) \} : \{ split: 1, maxRows: Math\.max\(1, Math\.ceil\(lim \/ 2\)\), w: Math\.max\(260, Math\.round\(w \/ 2\)\) \}\)/);
  assert.match(s, /tr\("Two table columns side by side"\)/);
});
