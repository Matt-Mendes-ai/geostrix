// TASKS.csv #3028 (review #2876, WA iron) — small Layout slips: (1) {convergence} printed '1.1° E' with no subject; (2) the declination was
// dated today though every collar had an ENDDATE ('14-Nov-18'); (3) the export's edge confirm called a Best intercepts table a collar table;
// (5) a new page was A4 landscape after an A3 page
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { formatConvergence } from "../src/lib/layoutText.js";
import { collarDrillDate, parseDrillDate } from "../src/lib/northDiagram.js";
import { elementKind, offSheetElements } from "../src/lib/layoutEdges.js";

test("(1) the convergence names both norths", () => {
  assert.equal(formatConvergence(1.14), "TN 1.1° E of GN");
  assert.equal(formatConvergence(-0.42), "TN 0.4° W of GN");
  assert.equal(formatConvergence(null), "");
});

test("(2) dd-Mon-yy dates, and an end date when nothing else dates the holes", () => {
  assert.equal(parseDrillDate("14-Nov-18"), "2018-11-14");
  assert.equal(parseDrillDate("3 Sept 2021"), "2021-09-03");
  assert.equal(parseDrillDate("14-Nov-87"), "1987-11-14");
  assert.equal(parseDrillDate("31-Foo-18"), null);
  assert.deepEqual(collarDrillDate([{ attrs: { ENDDATE: "14-Nov-18" } }, { attrs: { ENDDATE: "02-Dec-18" } }]), { date: "2018-12-02", field: "ENDDATE" });
  // #1773: a start date still wins over the end date
  assert.deepEqual(collarDrillDate([{ attrs: { STARTDATE: "2023-06-02", ENDDATE: "2024-01-01" } }]), { date: "2023-06-02", field: "STARTDATE" });
  // a field merely containing 'end' (a trend, a legend) is no date
  assert.equal(collarDrillDate([{ attrs: { trend_note: "2020-01-01" } }]), null);
});

test("(3) a sent table is a table, not a collar table", () => {
  assert.equal(elementKind({ type: "table", source: "static" }), "statictable");
  assert.equal(elementKind({ type: "table" }), "table");
  assert.equal(elementKind({ type: "legend" }), "legend");
  const off = offSheetElements([{ id: "t", type: "table", source: "static", x: 2000, y: 10, title: "Best intercepts" }], { w: 1123, h: 794 });
  assert.equal(off[0].type, "statictable");
  const L = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");
  assert.match(L, /statictable: "Table"/);
  assert.match(L, /return \{ type: elementKind\(el\) \/\* #3028 \(3\) \*\//);
});

test("(5) a new page takes the current page's paper, its starter placed for it", () => {
  const L = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");
  assert.match(L, /addLayoutPages\(\[\{ name: `Page \$\{layoutPages\.length \+ 1\}`, elements: starterFor\(fmt\) \}\]\);\r?\n\s*if \(id\) setLayoutPageFormat\(id, fmt\);/);
  assert.match(L, /el\.id === "north" \? \{ \.\.\.el, x: w - 123 \} : el\.id === "scale" \? \{ \.\.\.el, y: h - 74 \}/);
});
