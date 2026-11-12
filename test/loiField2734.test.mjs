// TASKS.csv #2734 (split from #2316) — loss on ignition kept beside the elements as the field 'LOI' (wt%): offered by the import, read with
// its negatives, and added to the oxide totals
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pickElementColumns, readLoiCell, LOI, resolvedSegments } from "../src/lib/geochem.js";
import { oxideTotals } from "../src/lib/oxideTotals.js";

test("pickElementColumns: an LOI column is the field LOI in %, the total first among several", () => {
  const headers = ["HoleID", "From", "To", "Fe_pct", "LOI371_pct", "LOI1000_XRF_pct", "LOITOTAL_pct", "LOI650"];
  const rows = [{ Fe_pct: "55", LOI371_pct: "1.2", LOI1000_XRF_pct: "6.1", LOITOTAL_pct: "6.4", LOI650: "3" }, { Fe_pct: "58", LOI371_pct: "1.0", LOI1000_XRF_pct: "5.0", LOITOTAL_pct: "5.2", LOI650: "2.5" }];
  const els = pickElementColumns(headers, rows);
  const loi = els.find((e) => e.symbol === LOI);
  assert.ok(loi, "LOI offered");
  assert.equal(loi.unit, "%");
  assert.equal(loi.header, "LOITOTAL_pct");
  assert.deepEqual(loi.alts, ["LOI1000_XRF_pct", "LOI371_pct", "LOI650"]);
  assert.equal(loi.methodCols, undefined, "the other LOI columns are not its method columns (no QAQC method pairs, no join)");
  assert.ok(els.find((e) => e.symbol === "Fe"), "the elements as before");
  assert.equal(pickElementColumns(["LOI", "Au"], [{ LOI: "2.1", Au: "0.5" }]).find((e) => e.symbol === LOI).header, "LOI");
  assert.equal(pickElementColumns(["Location", "Au"], [{ Location: "3", Au: "1" }]).some((e) => e.symbol === LOI), false);
});

test("readLoiCell: a negative LOI is a value; a no-data code is empty", () => {
  assert.deepEqual(readLoiCell("-0.83"), { value: -0.83, qualifier: null, kind: null });
  assert.equal(readLoiCell("6.4").value, 6.4);
  assert.equal(readLoiCell("-99").value, null);
  assert.equal(readLoiCell("-9999").value, null);
  assert.equal(readLoiCell("").value, null);
  assert.equal(readLoiCell("<0.01").qualifier, "<");
});

test("oxideTotals: the sum with LOI beside the oxide sum", () => {
  const majors = [["Si", "SiO2", 2.1393], ["Ti", "TiO2", 1.6681], ["Al", "Al2O3", 1.8895], ["Fe", "Fe2O3", 1.4297], ["Mg", "MgO", 1.6583], ["Ca", "CaO", 1.3992]].map(([symbol, oxide]) => ({ symbol, oxide, unit: `% ${oxide}` }));
  const a = (loi, extra = {}) => ({ values: { Si: 50, Ti: 1, Al: 15, Fe: 10, Mg: 7, Ca: 10, ...(loi != null ? { LOI: loi } : {}), ...extra } });
  const r = oxideTotals([a(6), a(-0.5), a(null)], majors);
  assert.equal(r.n, 3);
  assert.equal(r.median, 93);
  assert.deepEqual(r.loi, { n: 2, median: 99, p5: 92.5, p95: 99 });
  assert.equal(oxideTotals([a(null)], majors).loi, null);
});

test("wiring: the LOI cell reader in the import and the totals line", () => {
  const g = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
  assert.match(g, /const c = sym === LOI \? readLoiCell\(raw, posMaxOf\(header\)\)/);
  const t = readFileSync(new URL("../src/components/OxideTotalsTab.jsx", import.meta.url), "utf8");
  assert.match(t, /\{res\.loi \? " " \+ tr\("With their LOI \(\{n\} sample\(s\)\): median \{median\} %, 90 % of them between \{p5\} and \{p95\} %\."/);
});

test("#2887 — the WA iron file's -10 is no data; its real negatives stay negative; the assay questions leave LOI out", () => {
  assert.equal(readLoiCell("-10").value, null);
  assert.equal(readLoiCell("-10").kind, "neg_missing");
  assert.equal(readLoiCell("-12.5").value, null);
  for (const v of ["-0.18", "-1.05", "-0.42", "-3.4"]) assert.equal(readLoiCell(v).value, Number(v), v);
  // Grade stats, compositing and estimation read through resolvedSegments: a negative LOI is a value there too; an element's is still a code
  const rows = [{ hole_id: "H", from: 0, to: 2, values: { LOI: -0.42, Fe: -1 } }, { hole_id: "H", from: 2, to: 4, values: { LOI: 6.2, Fe: 5 } }];
  assert.deepEqual(resolvedSegments(rows, "LOI", "%", { LOI: "%", Fe: "%" }).map((s) => s.value), [-0.42, 6.2]);
  assert.deepEqual(resolvedSegments(rows, "Fe", "%", { LOI: "%", Fe: "%" }).map((s) => s.value), [5]);
  const m = readFileSync(new URL("../src/components/AssayImportModal.jsx", import.meta.url), "utf8");
  assert.match(m, /const codeHeaders = modal\.format === "long" \? importedHeaders : modal\.elements\.filter\(\(e\) => e\.checked && e\.symbol !== LOI\)\.map\(\(e\) => e\.header\);/);
  assert.match(m, /negativeSummary\(scan, codeHeaders,/);
  assert.match(m, /zeroCount\(scan, codeHeaders\)/);
  const g = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
  assert.match(g, /if \(zeroMode !== "bdl" \|\| sym === LOI \/\* #2887/);
});

test("the import findings leave every LOI column to the LOI line (LOI371 was listed as 'numeric, not an element')", async () => {
  const { assayImportFindings } = await import("../src/lib/assayImportFindings.js");
  const allRows = [{ LOI371_pct: "0.4", LOI1000_XRF_pct: "5.2", Width: "1.5" }, { LOI371_pct: "0.3", LOI1000_XRF_pct: "4.6", Width: "1.1" }];
  const f = assayImportFindings({ rows: [], elements: [], unitOf: () => "%", headers: ["LOI371_pct", "LOI1000_XRF_pct", "Width"], used: [], allRows, at: () => "" });
  assert.deepEqual(f.notImported, ["Width"]);
});
