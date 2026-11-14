// TASKS.csv #2330 (review #2325, WA uranium) — the import's row filter, pre-set by a Superseded / Current flag column
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rowFilterColumns, flagRowFilter, applyRowFilter, defaultRowFilter } from "../src/lib/importRowFilter.js";

// a WA-like lithology log: current rows and superseded re-logs of the same intervals
const rows = [];
for (let i = 0; i < 30; i++) rows.push({ Hole_ID: `H${i % 3}`, mFrom: i, mTo: i + 1, Lith1_Code: "SAN", Superseded: "FALSE" });
for (let i = 0; i < 46; i++) rows.push({ Hole_ID: `H${i % 3}`, mFrom: i % 30, mTo: (i % 30) + 1, Lith1_Code: "SAN", Superseded: "TRUE" });
const H = Object.keys(rows[0]);

test("a Superseded column is found and its TRUE rows are left out by default", () => {
  const cols = rowFilterColumns(H, rows);
  assert.deepEqual(cols.map((c) => c.col), ["Hole_ID", "Superseded"]); // Lith1_Code has one value; From / To have too many
  assert.deepEqual(defaultRowFilter(H, rows), { col: "Superseded", keep: ["FALSE"], drop: 46, flag: "superseded" });
  const r = applyRowFilter(rows, defaultRowFilter(H, rows));
  assert.equal(r.rows.length, 30); assert.equal(r.dropped, 46);
});

test("other spellings: -1 / 0, Is_Current, Valid; a non-flag column is never pre-set", () => {
  const a = [{ s: "-1" }, { s: "0" }, { s: "0" }];
  assert.deepEqual(flagRowFilter(rowFilterColumns(["s"], a).map((c) => ({ ...c, col: "SUPERSEDED" }))), { col: "SUPERSEDED", keep: ["0"], drop: 1, flag: "superseded" });
  const b = [{ Is_Current: "Y" }, { Is_Current: "N" }, { Is_Current: "Y" }];
  assert.deepEqual(defaultRowFilter(["Is_Current"], b), { col: "Is_Current", keep: ["Y"], drop: 1, flag: "current" });
  assert.equal(defaultRowFilter(["Valid"], [{ Valid: "TRUE" }, { Valid: "TRUE" }, { Valid: "x" }]), null); // not a yes / no flag
  assert.equal(defaultRowFilter(["Priority"], [{ Priority: "1" }, { Priority: "2" }]), null); // offered as a filter, never pre-set
  assert.equal(defaultRowFilter(["Superseded"], [{ Superseded: "FALSE" }, { Superseded: "FALSE" }]), null); // one value: nothing to filter
});

test("a filter the rows cannot apply leaves them as they are", () => {
  assert.equal(applyRowFilter(rows, { col: "Nope", keep: ["x"] }).dropped, 0);
  assert.equal(applyRowFilter(rows, null).rows, rows);
  // a user's own filter: Hole_ID H0 only
  assert.equal(applyRowFilter(rows, { col: "Hole_ID", keep: ["H0"] }).rows.length, 10 + 16);
});

test("the dialog shows the filter and the commit applies it, saying how many rows it left out", () => {
  const m = readFileSync(new URL("../src/components/ImportMappingModal.jsx", import.meta.url), "utf8");
  assert.match(m, /<RowFilterBox modal=\{modal\} onChange=\{onChange\} sel=\{sel\} \/>/);
  assert.match(m, /tr\("Import \{rowCount\} rows", \{ rowCount: importCount\(modal\) \}\)/); // the button counts the rows kept
  assert.match(m, /const countCache = new WeakMap\(\);/);
  const ip = readFileSync(new URL("../src/modules/viewer/importPipelineImpl.js", import.meta.url), "utf8");
  assert.match(ip, /const rowFilter = data\.rowFilter !== undefined \? data\.rowFilter : defaultRowFilter\(/);
  assert.match(ip, /const \{ rows: allRows, dropped: rowsFiltered \} = applyRowFilter\(allRowsIn, rowFilter\);/);
  assert.match(ip, /row\(s\) left out by the row filter/);
});
