// TASKS.csv #2332 (review #2325, WA uranium) — no-data codes in a downhole log channel are questioned and left out by default
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { channelNoData, noDataText, logChannelRows } from "../src/lib/downholeLogChannels.js";

// a WA-like log: eU3O8 0..299 ppm and cps 100..599, then 545 rows of eU3O8 -1 and 10 rows of the -1.83E+09 / 10.7 M sentinels
const rows = [];
for (let i = 0; i < 5000; i++) rows.push({ h: "A", d: i * 0.05, e: (i * 7) % 300, c: 100 + (i % 500) });
for (let i = 0; i < 545; i++) rows.push({ h: "B", d: i * 0.05, e: -1, c: 120 });
for (let i = 0; i < 10; i++) rows.push({ h: "C", d: i * 0.05, e: -1.83e9, c: 10.7e6 });

test("the codes the review found are named, with their counts", () => {
  const e = channelNoData(rows, "e", "ppm");
  assert.equal(e.n, 555); assert.equal(noDataText(e), "-1 × 545, -1.83E+09 × 10");
  const c = channelNoData(rows, "c", "cps");
  assert.equal(c.n, 10); assert.equal(noDataText(c), "1.07E+07 × 10");
  // a unit that can be negative keeps its negatives, but not an absurd one
  assert.equal(channelNoData([{ v: -20 }, { v: 10 }, { v: 15 }], "v", "mV"), null);
  assert.equal(channelNoData(rows, "e", "").n, 10); // unknown unit: -1 is kept, -1.83E+09 is still questioned
  assert.equal(channelNoData([{ v: -999 }, { v: 3 }], "v", "").n, 1); // a null sentinel in any unit
  assert.equal(channelNoData([{ v: 1 }, { v: 2 }], "v", "ppm"), null);
});

test("left out of the layer when asked, and counted", () => {
  const m = { hole_id: "h", depth: "d" };
  const nd = channelNoData(rows, "e", "ppm");
  const kept = logChannelRows(rows, m, "e", null), out = logChannelRows(rows, m, "e", null, nd.values);
  assert.equal(kept.rows.length, 5555); assert.equal(kept.dropped, 0);
  assert.equal(out.rows.length, 5000); assert.equal(out.dropped, 555);
  assert.ok(Math.min(...out.rows.map((r) => r.value)) >= 0);
  const bin = logChannelRows(rows, m, "e", 1, nd.values);
  assert.equal(bin.dropped, 555); assert.ok(bin.rows.every((r) => r.value >= 0));
});

test("the box asks (default: leave them out) and the commit says it", () => {
  const b = readFileSync(new URL("../src/components/LogChannelsBox.jsx", import.meta.url), "utf8");
  assert.match(b, /checked=\{!modal\.logKeepNoData\}/);
  // the hook sits before the early return
  assert.ok(b.indexOf("const noData = useMemo(") < b.indexOf("if (!shown) return null;"));
  const ip = readFileSync(new URL("../src/modules/viewer/importPipelineImpl.js", import.meta.url), "utf8");
  assert.match(ip, /const nd = data\.logKeepNoData \? null : channelNoData\(src, col, unitFromHeader\(col\)\);/);
  assert.match(ip, /no-data value\(s\) left out: \$\{noDataText\(nd\)\}/);
  assert.match(ip, /Left out on import as no-data codes: \$\{out\.dropped\} value\(s\)/);
});
