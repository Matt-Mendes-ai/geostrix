// TASKS.csv #2391 (split from #2330, review #2325) — the row filter in the assay import too, and an overlap count at commit naming the column
// that probably marks the out-of-date rows
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { overlapSummary, overlapWorthSaying, defaultRowFilter, applyRowFilter } from "../src/lib/importRowFilter.js";

// a re-logged table: 3 holes of 10 x 1 m current rows, and 9 re-assayed intervals (0.5 m off) flagged Superseded = -1 in a Version column too
const rows = [];
for (const h of ["A", "B", "C"]) for (let i = 0; i < 10; i++) rows.push({ hole_id: h, from: i, to: i + 1, Au: "0.1", Superseded: "0", Lab: i % 2 ? "ALS" : "SGS" });
for (const h of ["A", "B", "C"]) for (let i = 0; i < 3; i++) rows.push({ hole_id: h, from: i + 0.5, to: i + 1.5, Au: "0.2", Superseded: "-1", Lab: "ALS" });
const H = ["hole_id", "from", "to", "Au", "Superseded", "Lab"];
const cols = { hole: "hole_id", from: "from", to: "to" };

test("the overlap count, and the flag column the overlapping rows carry far more often than the rest", () => {
  const o = overlapSummary(rows, cols, H);
  assert.equal(o.total, 39);
  assert.equal(o.holes, 3);
  assert.equal(o.n, 9 + 12); // the 9 superseded rows and the 12 current ones they overlap (0-4 m in each hole)
  assert.equal(o.col, "Superseded");
  assert.equal(o.value, "-1");
  assert.ok(overlapWorthSaying(o));
  // the preset filter (#2330) leaves them out, and nothing overlaps after
  const f = defaultRowFilter(H, rows);
  assert.equal(f.col, "Superseded");
  const kept = applyRowFilter(rows, f).rows;
  assert.equal(overlapSummary(kept, cols, H).n, 0);
  // a clean table: nothing to say
  assert.ok(!overlapWorthSaying(overlapSummary(rows.slice(0, 30), cols, H)));
});

test("an overlap with no column that explains it: counted, no column named", () => {
  const r = rows.slice(0, 30).concat([{ hole_id: "A", from: 0.2, to: 0.8, Au: "1", Superseded: "0", Lab: "ALS" }, ...Array.from({ length: 6 }, (_, i) => ({ hole_id: "B", from: i + 0.3, to: i + 0.6, Au: "1", Superseded: "0", Lab: i % 2 ? "ALS" : "SGS" }))]);
  const o = overlapSummary(r, cols, H);
  assert.ok(o.n >= 5);
  assert.equal(o.col, null);
});

test("the assay dialog shows the filter and the assay commit applies it and says the overlaps; the interval import says them too", () => {
  const d = readFileSync(new URL("../src/components/AssayImportModal.jsx", import.meta.url), "utf8");
  assert.match(d, /<RowFilterBox modal=\{modal\} onChange=\{onChange\} sel=\{sel\} \/>/);
  const g = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
  assert.match(g, /const filtered = applyRowFilter\(modalIn\.allRows \|\| \[\], rowFilter\), modal = filtered\.dropped \? \{ \.\.\.modalIn, allRows: filtered\.rows \} : modalIn;/);
  assert.match(g, /overlapSummary\(allRows, \{ hole: mapping\.hole_id, from: mapping\.from, to: mapping\.to \}/);
  const u = readFileSync(new URL("../src/modules/viewer/useImportPipeline.js", import.meta.url), "utf8");
  assert.match(u, /if \(overlapWorthSaying\(o\) && o\.col\) setNotices/);
});
