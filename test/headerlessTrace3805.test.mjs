// TASKS.csv #3805 (Scottie Gold geophysics review) — a hole trace of 38 lines of 'X Y Z' with no header lost its first point (the collar) in Point survey > Import CSV:
// the reader made the first reading the column names. And a '/' comment line over a headerless .xyz was taken as the header (a five-word comment over a three-column file).
// A first row of numbers is data; a '/' line whose word count differs from the first data row's is a comment.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Papa from "papaparse";
import { headerlessTable } from "../src/lib/headerlessTable.js";
import { parseXYZ } from "../src/lib/geosoft.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const trace = Array.from({ length: 38 }, (_, i) => `${(531797.62 + i * 0.1).toFixed(2)} ${(5531479.74 - i * 0.2).toFixed(2)} ${(1244.96 - i * 6).toFixed(2)}`);

test("a headerless CSV: the first reading is kept as a row and the columns are named Column 1, 2, 3", () => {
  const text = trace.map((l) => l.split(" ").join(",")).join("\n");
  const p = Papa.parse(text, { header: true, skipEmptyLines: true });
  assert.equal(p.data.length, 37); // what the reader makes of it: 37 rows, the collar in the headers (the bug)
  const t = headerlessTable(p.meta.fields, p.data);
  assert.deepEqual(t.headers, ["Column 1", "Column 2", "Column 3"]);
  assert.equal(t.rows.length, 38); assert.equal(t.kept, 1);
  assert.deepEqual(t.rows[0], { "Column 1": 531797.62, "Column 2": 5531479.74, "Column 3": 1244.96 }); // the collar
  assert.equal(t.rows[37]["Column 3"], "1022.96"); // the rest as the reader gave them
});

test("a file with a header is not touched; nor are tables with fewer than three or more than twelve columns", () => {
  assert.equal(headerlessTable(["X", "Y", "Z"], [{ X: 1, Y: 2, Z: 3 }]), null);
  assert.equal(headerlessTable(["1", "2"], []), null);
  assert.equal(headerlessTable(Array.from({ length: 13 }, (_, i) => String(i)), []), null);
  assert.equal(headerlessTable(["1", "2", "year"], []), null); // one word among the numbers: a header
  assert.equal(headerlessTable(null, null), null);
});

test("repeated values in the first row (the reader's '0', '0_1') still read as numbers", () => {
  const t = headerlessTable(["10", "0", "0_1"], [{ 10: 11, 0: 5, "0_1": 6 }]);
  assert.deepEqual(t.rows[0], { "Column 1": 10, "Column 2": 0, "Column 3": 0 });
  assert.deepEqual(t.rows[1], { "Column 1": 11, "Column 2": 5, "Column 3": 6 });
});

test("a headerless .xyz: all 38 points, Column 1, 2, 3", () => {
  const g = parseXYZ(trace.join("\n"));
  assert.equal(g.rows.length, 38); assert.equal(g.headerless, true); assert.equal(g.rows[0]["Column 1"], 531797.62);
});

test("a '/' comment whose word count is not the data's is a comment (SCOTTIE_LOOP.tx); a header that matches is still the header", () => {
  const loop = ["/ Scottie transmitter loop corners, one per line", ...Array.from({ length: 208 }, (_, i) => `${531000 + i} ${5531000 + i} 1300`)].join("\n");
  const g = parseXYZ(loop);
  assert.deepEqual(g.columns, ["Column 1", "Column 2", "Column 3"]); assert.equal(g.rows.length, 208); assert.equal(g.headerless, true); assert.equal(g.commentSkipped, true);
  const h = parseXYZ("/ X Y Z VALUE\n1 2 3 4\n5 6 7 8\n");
  assert.deepEqual(h.columns, ["X", "Y", "Z", "VALUE"]); assert.equal(h.headerless, undefined); assert.equal(h.commentSkipped, undefined);
  const lines = parseXYZ("/ GEM dump\n/Gem Systems GSM-19W\n/ X Y elev rawmag\n10 20 30 40\n11 21 31 41\n");
  assert.deepEqual(lines.columns, ["X", "Y", "elev", "rawmag"]); // #600: the last '/' line with the data's count
});

test("wired: Import CSV keeps the first row and says so; the picker starts on X, Y, Z", () => {
  const m = read("../src/modules/GeophysicsModule.jsx");
  assert.match(m, /const hl = headerlessTable\(t0\.headers, t0\.rows\), t = hl \? \{ \.\.\.t0, headers: hl\.headers, rows: hl\.rows \} : t0;/);
  assert.match(m, /if \(hl\) \{ openPicker\(tr\("\\"\{name\}\\" has no header line: its first row/);
  for (const lang of ["es", "pt", "fr", "ar"]) assert.ok(JSON.parse(read(`../src/locales/${lang}.json`))['"{name}" has no header line: its first row ({first}) is a reading, so all {n} rows are kept and the columns are named Column 1, 2, 3 …. Column 1, 2, 3 are taken as X, Y, Z.'], lang);
});
