// TASKS.csv #2393 (review #2325, WA uranium) — rank a skewed log's codes by mean, P90 or the share above a value, not only the median
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { logByCode } from "../src/lib/downholeLogs.js";

// lignite: a low median with a heavy tail (the host); shale: higher median, nothing over 100
const rows = [], dom = [];
const put = (hole, code, vals) => vals.forEach((v, i) => { rows.push({ hole_id: hole, from: i, to: i + 1, values: { G: v } }); dom.push({ hole_id: hole, from: i, to: i + 1, value: code }); });
put("A", "LIG", [10, 12, 15, 18, 22, 25, 30, 300, 500, 900]);
put("B", "SHL", [30, 31, 32, 33, 34, 35, 36, 37, 38, 39]);

test("by median shale leads; by mean, P90 or the share above 100 lignite does", () => {
  assert.equal(logByCode(rows, "G", dom)[0].key, "SHL");
  assert.equal(logByCode(rows, "G", dom, { stat: "mean" })[0].key, "LIG");
  assert.equal(logByCode(rows, "G", dom, { stat: "p90" })[0].key, "LIG");
  const a = logByCode(rows, "G", dom, { stat: "above", above: 100 });
  assert.deepEqual(a.map((g) => [g.key, g.value, g.nAbove]), [["LIG", 30, 3], ["SHL", 0, 0]]);
});

test("the pane offers the choice and prints the share with its counts", () => {
  const p = readFileSync(new URL("../src/components/DownholeLogsPane.jsx", import.meta.url), "utf8");
  // domainFold: #2790 (case / space variants folded). #2948 — grouped once per (log, code layer), the ranking read from the kept groups
  assert.match(p, /groupLogByCode\(data\.assays, data\.symbol, domainFold\.rows\)/);
  assert.match(p, /rankLogGroups\(grouped, \{ stat: rankStat, above: Number\(rankAbove\) \}\)/);
  assert.match(p, /Share of readings above \{v\} per code, highest first/);
});
