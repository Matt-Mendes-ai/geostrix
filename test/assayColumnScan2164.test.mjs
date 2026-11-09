// TASKS.csv #2164 — the assay dialog's negative / zero / blank counts from one chunked pass (same numbers as the old per-column loops)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { scanAssayColumns, negativeSummary, zeroCount, blankCount, elementColumnStats } from "../src/lib/assayColumnScan.js";
import { pickElementColumns } from "../src/lib/geochem.js";
import { parseAssayValue, isBlankAssayCell, isOverLimitCode, NO_DATA_SENTINEL_MAX } from "../src/lib/geochem.js";

// the dialog's counts as they were computed before #2164 (AssayImportModal negativesOf / zeros / blanks)
function oldCounts(rows, hs, overOn = true) {
  const neg = { codes: 0, sentinels: 0, over: 0, overAny: 0 };
  for (const h of hs) {
    let max = 0; for (const r of rows) { const v = parseAssayValue(r[h]); if (v != null && v > max) max = v; }
    const c = { codes: 0, sentinels: 0, over: 0, overCode: null };
    for (const r of rows) { const v = parseAssayValue(r[h]); if (v == null || v >= 0) continue; if (isOverLimitCode(v, max)) { c.over++; c.overCode = v; } else if (v <= NO_DATA_SENTINEL_MAX) c.sentinels++; else c.codes++; }
    const back = overOn ? 0 : c.over;
    neg.codes += c.codes + (back && c.overCode > NO_DATA_SENTINEL_MAX ? back : 0); neg.sentinels += c.sentinels + (back && c.overCode <= NO_DATA_SENTINEL_MAX ? back : 0);
    neg.over += overOn ? c.over : 0; neg.overAny += c.over;
  }
  let zeros = 0; for (const r of rows) for (const h of hs) if (parseAssayValue(r[h]) === 0) zeros++;
  let blanks = 0; for (const r of rows) { let e = 0; for (const h of hs) if (isBlankAssayCell(r[h])) e++; if (e < hs.length) blanks += e; }
  return { neg, zeros, blanks };
}

function rowsOf(n, seed = 7) {
  let x = seed; const rnd = () => ((x = (x * 16807) % 2147483647) / 2147483647);
  const pick = () => { const u = rnd(); return u < 0.08 ? "" : u < 0.12 ? "0" : u < 0.15 ? "-0.005" : u < 0.17 ? "-9999" : u < 0.19 ? "<0.01" : u < 0.2 ? "<0" : u < 0.21 ? "-10" : String(+(rnd() * 9.5).toFixed(2)); };
  return Array.from({ length: n }, () => ({ Au: pick(), Cu: pick(), K: pick(), Empty: rnd() < 0.5 ? "" : null }));
}

test("one chunked pass gives the old counts, for any ticked subset and either over-limit choice", async () => {
  const rows = rowsOf(5000);
  const progress = [];
  const st = await scanAssayColumns(rows, ["Au", "Cu", "K", "Empty"], { chunk: 700, onProgress: (f) => progress.push(f) });
  assert.ok(progress.length >= 7 && progress.every((f, i) => f > 0 && f < 1 && (i === 0 || f > progress[i - 1])), "progress between chunks");
  for (const hs of [["Au"], ["Au", "Cu"], ["Au", "Cu", "K"], ["K", "Empty"], ["Au", "Cu", "K", "Empty"]]) {
    for (const overOn of [true, false]) {
      const old = oldCounts(rows, hs, overOn), sum = negativeSummary(st, hs, overOn);
      assert.deepEqual({ codes: sum.codes, sentinels: sum.sentinels, over: sum.over, overAny: sum.overAny }, old.neg, `${hs} ${overOn}`);
    }
    const old = oldCounts(rows, hs);
    assert.equal(zeroCount(st, hs), old.zeros, `zeros ${hs}`);
    assert.equal(blankCount(st, hs), old.blanks, `blanks ${hs}`);
  }
});

test("an over-limit code at the column's largest value; long format counts every empty value", async () => {
  const rows = [{ K: "8.4" }, { K: "9.89" }, { K: "-10" }, { K: "" }, { K: "-0.01" }];
  const st = await scanAssayColumns(rows, ["K"]);
  const s = negativeSummary(st, ["K"]);
  assert.equal(s.over, 1); assert.equal(s.codes, 1); assert.deepEqual(s.overCols, ["K -10 (×1)"]);
  assert.equal(blankCount(st, ["K"], { long: true }), 1);
  assert.equal(blankCount(st, ["K"]), 0, "wide: a row with no result at all is not counted");
});

test("cancelling between chunks stops the scan", async () => {
  let calls = 0;
  const st = await scanAssayColumns(rowsOf(3000), ["Au"], { chunk: 500, isCancelled: () => ++calls >= 2 });
  assert.equal(st, null);
});

test("the dialog waits for the check before Import, and says so", () => {
  const src = readFileSync(new URL("../src/components/AssayImportModal.jsx", import.meta.url), "utf8");
  assert.ok(src.includes("disabled={!!modal.busy || !scan}"));
  assert.ok(src.includes('tr("Checking the values for negatives, zeros and empty cells… {pct}%"'));
  assert.ok(!src.includes("negByColumn"), "no per-column rescans left");
});

test("pickElementColumns with the chunked counts picks what it picked counting itself", async () => {
  const rows = rowsOf(4000).map((r, i) => ({ ...r, Au_gpt: r.Au, Au_OL: i % 9 ? "" : "12.5", Cu_error: "0.1", Hole: "DH1" }));
  const headers = ["Hole", "Au", "Au_gpt", "Au_OL", "Cu", "Cu_error", "K", "Empty"];
  const stats = await elementColumnStats(rows, headers, { chunk: 600 });
  assert.ok(!stats.has("Hole"));
  assert.deepEqual(pickElementColumns(headers, rows, stats), pickElementColumns(headers, rows));
});

test("Geochem counts a big table's element columns in chunks with status-bar progress, and says a big file is being read", () => {
  const gm = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
  assert.ok(gm.includes("if (data.length < ELEMENT_SCAN_CHUNKED_ROWS) { openWide(null); return; }"));
  assert.ok(gm.includes("elementColumnStats(data, headers, { onProgress:"));
  assert.ok(gm.includes('const readLabel = file.size >= 20e6 ? tr("Reading {name}…", { name: file.name }) : null;'));
});
