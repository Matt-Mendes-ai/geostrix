// TASKS.csv #2177 (Matt's decision 2026-11-09) — a table over the memory budget: its columns chosen before the read, only those held
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseTableText, parseColumnsRaw, rowsFromColumns, confirmTableSize, tableColumnsPreview, subsetBytes, TABLE_MEMORY_BUDGET } from "../src/lib/tabular.js";

const csv = "HOLEID,SAMPFROM,SAMPTO,Au,Cu,LAB,BATCH\nA1,0,1,0.5,120,ALS,B1\nA1,1,2,<0.01,80,ALS,B1\nA2,0,2,3.25,15,ALS,B2\n";

test("rows: only the kept columns, values as the full read gives them", () => {
  const all = parseTableText(csv), sub = parseTableText(csv, { keep: ["HOLEID", "SAMPFROM", "SAMPTO", "Au"] });
  assert.deepEqual(sub.headers, ["HOLEID", "SAMPFROM", "SAMPTO", "Au"]);
  assert.deepEqual(Object.keys(sub.rows[0]), ["HOLEID", "SAMPFROM", "SAMPTO", "Au"]);
  sub.rows.forEach((r, i) => sub.headers.forEach((h) => assert.deepEqual(r[h], all.rows[i][h])));
  assert.equal(sub.rows[1].Au, "<0.01"); // text kept exactly
});

test("columns: the kept columns only, the width check still on the file's own width", () => {
  const raw = parseColumnsRaw(csv, { keep: ["HOLEID", "Au", "Cu"] });
  assert.deepEqual(raw.headers, ["HOLEID", "Au", "Cu"]);
  assert.equal(raw.cols.length, 3);
  const rows = rowsFromColumns(raw).rows;
  assert.equal(rows[2].Au, 3.25); assert.equal(rows[0].Cu, 120); assert.equal(rows[1].Au, "<0.01");
  assert.equal(parseColumnsRaw(csv.replace("A2,0,2,3.25,15,ALS,B2", "A2,0,2,3.25"), { keep: ["HOLEID"] }), null); // a short row: not this reader
});

test("the size check: a chooser's answer is returned as it is; under the budget nothing is asked", async () => {
  const big = { name: "assays_1.csv", size: 4e8, slice: () => ({ text: async () => "HOLEID,FROM,TO," + Array.from({ length: 80 }, (_, i) => `E${i}`).join(",") + "\n" + Array.from({ length: 2000 }, () => "A,0,1," + Array(80).fill("0.1").join(",")).join("\n") }) };
  let seen = null;
  const r = await confirmTableSize(big, { confirm: () => true, choose: async (f, pv) => { seen = pv; return { keep: ["HOLEID", "FROM", "TO", "E0"] }; } });
  assert.deepEqual(r, { keep: ["HOLEID", "FROM", "TO", "E0"] });
  assert.equal(seen.cols, 83); assert.equal(seen.headers.length, 83); assert.equal(seen.headers[0], "HOLEID");
  assert.ok(subsetBytes(seen, 4) < subsetBytes(seen, 83));
  assert.equal(await confirmTableSize({ name: "s.csv", size: 1000 }, { confirm: () => false, choose: async () => false }), true);
  // no chooser mounted: the #2171 yes / no question
  assert.equal(await confirmTableSize(big, { confirm: () => false, choose: () => null }), false);
});

test("the preview: header names and the fixed / per-column memory", async () => {
  const f = { name: "t.csv", size: 3e8, slice: () => ({ text: async () => "﻿\"HOLE ID\";FROM;TO;Au\n" + "A;0;1;2\n".repeat(500) }) };
  const pv = await tableColumnsPreview(f);
  assert.deepEqual(pv.headers, ["HOLE ID", "FROM", "TO", "Au"]);
  assert.equal(pv.fixed, 9e8);
  assert.ok(pv.perColumn > 0 && TABLE_MEMORY_BUDGET === 2e9);
});

test("wired: the read takes the chosen columns, the app mounts the chooser, the worker passes keep through", () => {
  const t = readFileSync(new URL("../src/lib/tabular.js", import.meta.url), "utf8");
  assert.match(t, /if \(ok\.keep\?\.length\) opts = \{ \.\.\.\(opts \|\| \{\}\), keep: ok\.keep \};/);
  const a = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(a, /useEffect\(\(\) => onTableSubsetRequest\(\(d\) => setSubsetRequest\(d\)\), \[\]\);/);
  assert.doesNotMatch(a, /from "\.\/lib\/tabular\.js"/); // papaparse stays off the start-up bundle (#1493)
  const w = readFileSync(new URL("../src/lib/tabular.worker.js", import.meta.url), "utf8");
  assert.match(w, /parseColumnsRaw\(text, opts\)/); assert.match(w, /parseTableText\(text, \{ \.\.\.opts, columnar: false \}\)/);
});
