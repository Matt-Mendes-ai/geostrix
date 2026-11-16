// TASKS.csv #3737 / #3738 (Scottie Gold) — a headerless x y z file is read; a text table with an odd extension is named as one; skipped files and UBC model files are named
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseXYZ } from "../src/lib/geosoft.js";
import { looksLikeTextTable } from "../src/lib/textTableSniff.js";

const trace = Array.from({ length: 37 }, (_, i) => `${528000 + i * 2.5} ${6120000 + i * 1.5} ${900 - i * 3}`).join("\n");
test("37 lines of 'x y z' with no header are read as Column 1, 2, 3", () => {
  const r = parseXYZ(trace);
  assert.deepEqual(r.columns, ["Column 1", "Column 2", "Column 3"]); assert.equal(r.headerless, true); assert.equal(r.rows.length, 37);
  assert.equal(r.rows[1]["Column 3"], 897);
  const four = parseXYZ("1 2 3 4.5\n2 3 4 5.5\n");
  assert.equal(four.columns.length, 4);
  assert.equal(parseXYZ("// a comment\n1 2 3\n").headerless, true);
});
test("a file with a header is unchanged, and prose or two columns are still refused", () => {
  const withHeader = parseXYZ("/ X Y Z\n1 2 3\n4 5 6\n");
  assert.deepEqual(withHeader.columns, ["X", "Y", "Z"]); assert.equal(withHeader.headerless, undefined);
  assert.throws(() => parseXYZ("1 2\n3 4\n"), /No column header line/);
  assert.throws(() => parseXYZ("just some words\nmore words here\n"), /No column header line/);
});
test("a text table is recognized whatever its extension; binary and prose are not", () => {
  assert.equal(looksLikeTextTable("Hole,Depth,Az,Dip\nH1,0,90,-60\nH1,30,91,-61\nH1,60,92,-62\n"), true);
  assert.equal(looksLikeTextTable("0 0 0\n10 5 -1\n20 9 -2\n"), true);
  assert.equal(looksLikeTextTable("PK\u0000\u0003\u0004 binary\u0000\n1 2 3\n4 5 6\n"), false);
  assert.equal(looksLikeTextTable("This is a note about the drilling programme\nIt has no table in it\nJust sentences here\n"), false);
  assert.equal(looksLikeTextTable(""), false);
});
test("wired: the skipped files are named, a UBC model beside its mesh is named with it, a text table is advised, and a failed batch names every file", () => {
  const imp = fs.readFileSync(new URL("../src/modules/viewer/importPipelineImpl.js", import.meta.url), "utf8");
  assert.match(imp, /\{skipped\} unrecognized file\(s\) skipped: \{names\}\./);
  assert.match(imp, /a UBC-GIF mesh and its model/);
  assert.match(imp, /looks like a text table\. Rename it to \.csv/);
  assert.match(imp, /ubcPaired\.has\(f\)/);
  const g = fs.readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");
  assert.match(g, /for \(const f of files\.slice\(1\)\) \{ try \{ parseXYZ/);
  assert.match(g, /headerless \? columns\[0\]/);
});
