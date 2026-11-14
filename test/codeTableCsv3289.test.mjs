// TASKS.csv #3289 — the Downhole logs code table as a CSV (and the same cells as tab text for Copy table). SYNTHETIC rows.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { codeTableCells, codeTableCsv, codeTableText } from "../src/lib/codeTableCsv.js";
const rows = [{ key: "BAS", n: 12, readings: 40, mean: 12.3456, median: 11, p10: 2.2, p90: 30.04 }, { key: "(not logged)", n: 3, readings: 3, mean: 1, median: 1, p10: 1, p90: 1 }, { key: "  ", n: 1, readings: 1, mean: NaN, median: 2, p10: 2, p90: 2 }, { key: 'a,"b"', n: 2, readings: 2, mean: 1, median: 1, p10: 1, p90: 1 }];
test("cells: English header with the unit, blank key named, figures to 4 significant digits", () => {
  const c = codeTableCells(rows, { unit: "SI", notLogged: "(not logged)" });
  assert.deepEqual(c.head, ["Code", "Readings", "Mean (SI)", "Median (SI)", "P10 (SI)", "P90 (SI)"]);
  assert.deepEqual(c.body[0], ["BAS", 12, "12.35", "11", "2.2", "30.04"]);
  assert.equal(c.body[2][0], "(blank)"); assert.equal(c.body[2][2], "", "a NaN mean is empty");
  assert.deepEqual(codeTableCells(rows, { binned: true }).head.slice(0, 3), ["Code", "Bins", "Readings"]);
});
test("csv quotes commas and quotes, CRLF lines; the text is tab separated", () => {
  const c = codeTableCells(rows);
  const csv = codeTableCsv(c).split("\r\n");
  assert.equal(csv[0], "Code,Readings,Mean,Median,P10,P90"); assert.equal(csv[4], '"a,""b""",2,1,1,1,1'.replace(",1,1,1,1", ",1,1,1,1")); 
  assert.equal(codeTableText(c).split("\n")[1], "BAS\t12\t12.35\t11\t2.2\t30.04");
});
test("wired in the pane", () => {
  const p = fs.readFileSync(new URL("../src/components/DownholeLogsPane.jsx", import.meta.url), "utf8");
  assert.ok(p.includes('suggestedName: "log_code_table.csv"') && p.includes("navigator.clipboard.writeText(text)"));
});
