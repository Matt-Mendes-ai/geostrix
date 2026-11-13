// TASKS.csv #3019 (review #2876, WA iron) — Best intercepts 'To Layout': the 'Also show' elements on the sheet, one number of decimals per
// column, and a page of its own when the active page has no clear spot (the table landed over the plan, the north diagram, the title block)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { interceptTablePlan, columnFormat } from "../src/lib/interceptTable.js";

test("columnFormat: one number of decimals for the column, from its largest value", () => {
  const fe = columnFormat([56.066, 59, 58.6, 60.7]);
  assert.deepEqual([56.066, 59, 58.6, 60.7].map(fe), ["56.07", "59.00", "58.60", "60.70"]);
  const gt = columnFormat([1708.6, 1698, 1629]);
  assert.deepEqual([1708.6, 1698, 1629].map(gt), ["1709", "1698", "1629"]);
  const au = columnFormat([0.25, 0.031, 0.5]);
  assert.deepEqual([0.25, 0.031, 0.5].map(au), ["0.2500", "0.0310", "0.5000"], "largest 0.5: four significant figures there");
  assert.equal(columnFormat([0.00004])(0.00004), "0.0000", "at most 4 decimals");
  assert.equal(fe(null), "");
});

test("the plan says when its spot overlaps another element", () => {
  const A4L = { w: 1123, h: 794 };
  assert.equal(interceptTablePlan([], A4L, { total: 10 }).overlaps, false);
  const full = [{ id: "plan", type: "drillplan", x: 30, y: 30, w: 1063, h: 734 }];
  assert.equal(interceptTablePlan(full, A4L, { total: 60 }).overlaps, true);
});

test("wiring: the extra columns and their cells, the widened table, and the page of its own", () => {
  const b = readFileSync(new URL("../src/components/BestIntercepts.jsx", import.meta.url), "utf8");
  assert.match(b, /\.\.\.shownExtras\.map\(\(s\) => `\$\{s\} \(\$\{gradeUnitLabel\(s, elementUnits\[s\]\)\}\)`\)/);
  assert.match(b, /\.\.\.shownExtras\.map\(\(s\) => \(r\.extras\?\.\[s\] == null \? "—" : fExtra\[s\]\(r\.extras\[s\]\)\)\)/);
  assert.match(b, /const tableW = Math\.min\(pageSize\.w - 80, 560 \+ 70 \* shownExtras\.length\);/);
  assert.match(b, /if \(ownPage\) addLayoutPages\(\[\{ name: tr\("Best intercepts"\), elements: \[table\] \}\]\);/);
});
