// TASKS.csv #2321 (split from #2177) — a very large table read for some holes only: other holes' rows dropped as each row is read
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseTableText, parseColumnsRaw, rowsFromColumns, parseTableFile } from "../src/lib/tabular.js";
import { holesShare, subsetBytes } from "../src/lib/tableSubsetRequest.js";

const csv = "HOLE_ID,FROM,TO,Au,Cu\nA,0,1,0.1,10\nB,0,1,0.2,20\nA,1,2,0.3,30\nC,0,1,0.4,40\nB,1,2,0.5,50\n";

test("the row reader keeps only the chosen holes' rows, with or without a column subset", () => {
  const all = parseTableText(csv);
  assert.equal(all.rows.length, 5); assert.equal(all.droppedByHole, undefined);
  const ab = parseTableText(csv, { holes: { col: "HOLE_ID", ids: ["A", " B "] } });
  assert.deepEqual(ab.rows.map((r) => r.HOLE_ID), ["A", "B", "A", "B"]); assert.equal(ab.droppedByHole, 1);
  assert.deepEqual(ab.headers, ["HOLE_ID", "FROM", "TO", "Au", "Cu"]);
  const a = parseTableText(csv, { keep: ["HOLE_ID", "Au"], holes: { col: "HOLE_ID", ids: ["A"] } });
  assert.deepEqual(a.rows, [{ HOLE_ID: "A", Au: 0.1 }, { HOLE_ID: "A", Au: 0.3 }]); assert.equal(a.droppedByHole, 3);
});

test("the column reader too (the big-assay path), and an unknown hole column falls back to the row reader", () => {
  const raw = parseColumnsRaw(csv, { keep: ["HOLE_ID", "Cu"], holes: { col: "HOLE_ID", ids: ["B", "C"] } });
  assert.equal(raw.n, 3); assert.equal(raw.droppedByHole, 2);
  const out = rowsFromColumns(raw);
  assert.deepEqual(out.rows.map((r) => [r.HOLE_ID, r.Cu]), [["B", 20], ["C", 40], ["B", 50]]); assert.equal(out.droppedByHole, 2);
  assert.equal(parseColumnsRaw(csv, { holes: { col: "NOPE", ids: ["A"] } }), null);
});

test("the file reader says what it left out", async () => {
  const file = new File([csv], "big.csv", { type: "text/csv" });
  const out = await parseTableFile(file, { sizeChecked: true, keep: ["HOLE_ID", "Au"], holes: { col: "HOLE_ID", ids: ["A"], label: "the holes in this project" } });
  assert.equal(out.rows.length, 2);
  assert.match(out.note, /Only the rows of 1 hole\(s\) \(the holes in this project\) were read: 3 other row\(s\) were left out as the file was read\./);
  assert.deepEqual(out.holesSubset, { col: "HOLE_ID", n: 1 });
});

test("the chooser's estimate follows the share of the first rows kept", () => {
  const pv = { headers: ["HOLE_ID", "Au"], sample: [["A", "1"], ["B", "2"], ["A", "3"], ["C", "4"]], fixed: 100, perColumn: 1000 };
  assert.deepEqual(holesShare(pv, "HOLE_ID", ["A"]), { share: 0.5, seen: 4, kept: 2 });
  assert.equal(holesShare(pv, "HOLE_ID", ["Z"]).kept, 0);
  assert.equal(subsetBytes(pv, 2, 0.5), 100 + 1000);
  assert.equal(subsetBytes(pv, 2), 100 + 2000);
  const m = readFileSync(new URL("../src/components/TableColumnsModal.jsx", import.meta.url), "utf8");
  assert.match(m, /aria-label=\{tr\("Rows to read"\)\}/);
  assert.match(m, /holes: \{ col: holeCol, ids, label:/);
  const t = readFileSync(new URL("../src/lib/tabular.js", import.meta.url), "utf8");
  assert.match(t, /if \(ok\.holes\?\.col && ok\.holes\.ids\?\.length\) opts = /);
});
