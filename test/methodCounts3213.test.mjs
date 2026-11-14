// TASKS.csv #3213 — the method-column counts (and the choice of an element's main column) counted the -999 no-data cells as results, and a partial
// copper in true per cent beside a _pct column holding ppm was offered to join without a word. Synthetic table.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { pickElementColumns, isResultValue } from "../src/lib/geochem.js";
import { elementColumnStats } from "../src/lib/assayColumnScan.js";

// 100 samples: Cu_TOT_pct holds ppm (100-9,900) on every row; Cu_AA05_pct is true per cent on 70 rows, -999 on 30; Cu_AA17_pct likewise on 60 / 40
const rows = Array.from({ length: 100 }, (_, i) => ({ HOLE: "SY-1", FROM: String(i), TO: String(i + 1), Cu_TOT_pct: String(100 + i * 98), Cu_AA05_pct: i < 70 ? String((0.01 + i * 0.009).toFixed(3)) : "-999", Cu_AA17_pct: i >= 40 ? String((0.02 + i * 0.008).toFixed(3)) : "-999" }));
const headers = Object.keys(rows[0]).slice(3);

test("a -999 cell is no result", () => {
  assert.equal(isResultValue(-999), false); assert.equal(isResultValue(-99), false); assert.equal(isResultValue(-9999), false);
  assert.equal(isResultValue(0.5), true); assert.equal(isResultValue(-0.005), true, "a below-detection code is a cell the import reads (as '<')");
  assert.equal(isResultValue(null), false); assert.equal(isResultValue(NaN), false);
});

test("the counts leave the -999s out, in the per-row pass and in the chunked stats", async () => {
  for (const stats of [null, await elementColumnStats(rows, headers, { chunk: 7 })]) {
    const [cu] = pickElementColumns(headers, rows, stats);
    assert.equal(cu.header, "Cu_TOT_pct");
    assert.deepEqual(cu.methodCols.map((c) => [c.header, c.n]), [["Cu_AA05_pct", 70], ["Cu_AA17_pct", 60]], "not 100 and 100");
    assert.equal(cu.methodOverlap.withAny, 100);
    assert.equal(cu.methodOverlap.withSeveral, 100, "every row has the total and at least one partial");
  }
});

test("a method column a thousandfold from the main one is flagged and never joined by default", () => {
  const [cu] = pickElementColumns(headers, rows);
  assert.ok(cu.methodCols.every((c) => c.rangeClash), "0.6 % beside 9,802 'per cent'");
  assert.equal(cu.join, false);
  // the same units: no flag
  const same = rows.map((r) => ({ ...r, Cu_TOT_pct: String(Number(r.Cu_TOT_pct) / 10000) }));
  const [cu2] = pickElementColumns(headers, same);
  assert.ok(cu2.methodCols.every((c) => !c.rangeClash));
});

test("the dialog says it", () => {
  const m = fs.readFileSync(new URL("../src/components/AssayImportModal.jsx", import.meta.url), "utf8");
  assert.match(m, /values a thousandfold apart from/);
  assert.match(m, /c\.rangeClash\) \? "var\(--color-warn-text\)"/);
});
