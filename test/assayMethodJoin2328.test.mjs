// TASKS.csv #2328 (review #2325, WA uranium) — an element's method columns are named, counted and joined when they hardly overlap
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pickElementColumns } from "../src/lib/geochem.js";

// five method sets, each sample analysed by one: U_102 on 50 rows, U_100 on 30, U_101 on 15; S as % in one column and ppm in another
const rows = [];
for (let i = 0; i < 100; i++) {
  const r = { HOLEID: "A", FROM: i, TO: i + 1 };
  if (i < 50) r.U_102 = String(10 + i); else if (i < 80) r.U_100 = String(20 + i); else if (i < 95) r.U_101 = String(30 + i);
  if (i < 60) r.S_pct = "0.5"; else r.S_ppm = "4000";
  rows.push(r);
}
const headers = ["HOLEID", "FROM", "TO", "U_102", "U_100", "U_101", "S_pct", "S_ppm"];

test("the fullest column is read, and the others are named with their counts and joined by default", () => {
  const u = pickElementColumns(headers, rows).find((e) => e.symbol === "U");
  assert.equal(u.header, "U_102"); assert.equal(u.n, 50);
  assert.deepEqual(u.methodCols.map((c) => [c.header, c.n]), [["U_100", 30], ["U_101", 15]]);
  assert.deepEqual(u.methodOverlap, { withAny: 95, withSeveral: 0 });
  assert.equal(u.join, true);
  const s = pickElementColumns(headers, rows).find((e) => e.symbol === "S");
  assert.equal(s.methodCols[0].unit === "ppm" || s.methodCols[0].unit === "%", true); // each column keeps its own unit
});

test("columns that overlap a lot are not joined by default", () => {
  const dup = rows.map((r, i) => ({ ...r, U_100: String(5 + i) })); // a second method on every row
  const u = pickElementColumns(headers, dup).find((e) => e.symbol === "U");
  assert.equal(u.join, false);
  assert.ok(u.methodOverlap.withSeveral / u.methodOverlap.withAny > 0.05);
});

test("the dialog offers the join and the commit fills a missing value from the first method column, said in the notice", () => {
  const m = readFileSync(new URL("../src/components/AssayImportModal.jsx", import.meta.url), "utf8");
  assert.match(m, /aria-label=\{tr\("Join the method columns of \{sym\}", \{ sym: e\.symbol \}\)\}/);
  const g = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
  assert.match(g, /if \(v == null && e\.join && e\.methodCols\?\.length && e\.header === e\.mainHeader\) \{/);
  assert.match(g, /v = convertUnit\(c2\.value, mc\.unit, existingUnit\[e\.symbol\] \|\| e\.unit\);/);
  assert.match(g, /Method columns joined \(a sample's value from the first column that has one\): \{list\}\./);
});
