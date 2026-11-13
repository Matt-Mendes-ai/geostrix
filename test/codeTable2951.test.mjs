// TASKS.csv #2951 (review #2876, WA iron) — density by strand: every code's n, mean, median, P10, P90 in a table (the sentence printed 8, led
// by codes of 9 bins); codes under a minimum count go last; a binned log's mean weighs each bin by its readings (ONAM read 1 % low).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { groupLogByCode, rankLogGroups, codeTable, NOT_LOGGED } from "../src/lib/downholeLogs.js";
import { sourceAssays } from "../src/lib/numericSources.js";
import { quantileSorted } from "../src/lib/arrayStats.js";

// a binned density log (downholeLogChannels: value = the bin's mean, n = its readings) and a strand log
const holes = ["A", "B"];
const strands = holes.flatMap((h) => [{ hole_id: h, from: 0, to: 10, value: "ONAM" }, { hole_id: h, from: 10, to: 11, value: "MNG_U" }, { hole_id: h, from: 11, to: 20, value: "TNAM" }]);
const bins = holes.flatMap((h, i) => Array.from({ length: 40 }, (_, k) => ({ hole_id: h, from: k * 0.5, to: k * 0.5 + 0.5, value: 2.5 + ((k * 7 + i) % 11) / 10, n: 1 + ((k + i) % 5), min: 2, max: 4 })));
const layer = { id: 5, name: "downhole_logs: Density_Best", unit: "g/cc", binM: 0.5, rows: bins };

test("a binned log's bins carry their readings; the table's mean weighs by them, the median and percentiles are of the bins", () => {
  const data = sourceAssays({ key: "custom:5:value", layerId: 5, field: "value", symbol: "D", unit: "g/cc", binM: 0.5 }, { customLayers: [layer] });
  assert.ok(data.assays.every((a) => a.w >= 1 && a.w <= 5), "w = the bin's n");
  const g = groupLogByCode(data.assays, "D", strands);
  const t = codeTable(g);
  for (const code of ["ONAM", "TNAM", "MNG_U"]) {
    const row = t.find((r) => r.key === code);
    const mine = data.assays.filter((a) => strands.find((s) => s.hole_id === a.hole_id && (a.from + a.to) / 2 >= s.from && (a.from + a.to) / 2 < s.to)?.value === code);
    const wv = mine.reduce((s, a) => s + a.w * a.values.D, 0), w = mine.reduce((s, a) => s + a.w, 0);
    assert.equal(row.n, mine.length);
    assert.equal(row.readings, w);
    assert.ok(Math.abs(row.mean - wv / w) < 1e-12, code);
    const v = mine.map((a) => a.values.D).sort((a, b) => a - b);
    assert.equal(row.median, quantileSorted(v, 0.5));
    assert.equal(row.p10, quantileSorted(v, 0.1));
    assert.equal(row.p90, quantileSorted(v, 0.9));
    assert.equal(row.weighted, true);
  }
  // the ranking by mean uses the weighted mean too
  const onam = rankLogGroups(g, { stat: "mean" }).find((r) => r.key === "ONAM");
  assert.ok(Math.abs(onam.value - t.find((r) => r.key === "ONAM").mean) < 1e-12);
});

test("an unbinned log: plain means, readings = n; every code is in the table, the not-logged ones too", () => {
  const rows = [{ hole_id: "A", from: 0, to: 1, values: { D: 2 } }, { hole_id: "A", from: 1, to: 2, values: { D: 4 } }, { hole_id: "A", from: 30, to: 31, values: { D: 3 } }];
  const t = codeTable(groupLogByCode(rows, "D", strands));
  const onam = t.find((r) => r.key === "ONAM");
  assert.deepEqual([onam.n, onam.readings, onam.mean, onam.weighted], [2, 2, 3, false]);
  assert.ok(t.some((r) => r.key === NOT_LOGGED && r.n === 1), "a one-reading code is listed (greyed in the pane), not dropped");
});

test("the pane: common codes first in the box plot and the sentence, the table with a minimum count, copy and the unit", () => {
  const p = readFileSync(new URL("../src/components/DownholeLogsPane.jsx", import.meta.url), "utf8");
  assert.match(p, /useKeptState\(keptScope, "dhlogs\.minCount", "30"\)/);
  assert.match(p, /<BoxPlots fit groups=\{ranked\.all\}/);
  assert.match(p, /\(ranked\.common\.length \? ranked\.common : groups\)\.slice\(0, 8\)/);
  assert.match(p, /<CodeTable rows=\{table\} order=\{ranked\.all\.map\(\(g\) => g\.key\)\} minCount=\{minCount\} unit=\{unitOf\(source\.unit\)\} binned=\{!!source\?\.binM\} keptScope=\{keptScope\} \/>/);
  assert.match(p, /navigator\.clipboard\.writeText\(\[head, \.\.\.body\]\.join\("\\n"\)\)/);
  assert.match(p, /`Mean\$\{u\}`/, "the copy says the unit");
  assert.match(p, /if \(ra !== rb\) return ra \? 1 : -1;/, "codes under the minimum count last, whatever the column");
  assert.match(p, /k: table\.filter\(\(r\) => r\.n < minCount\)\.length/, "the note counts the greyed rows of the table");
});
