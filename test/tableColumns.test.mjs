// TASKS.csv #611 — big assay exports held as columns: the same values as the row reader, far less memory.
import test from "node:test";
import assert from "node:assert/strict";
import { parseTableText, parseTableColumns } from "../src/lib/tabular.js";

const same = (a, b) => (a instanceof Date || b instanceof Date ? String(a) === String(b) : Object.is(a, b));

function assayCsv(n) {
  const lines = ["hole_id,from_m,to_m,sample_id,au_analysis_code,au_ppm,cu_ppm,as_ppm,flag,logged_at"];
  for (let i = 0; i < n; i++) {
    const au = i % 9 === 0 ? "<0.005" : i % 13 === 0 ? "" : (i * 0.0137).toFixed(4);
    const cu = i % 17 === 0 ? "-1" : i % 19 === 0 ? "N/A" : String(i * 3);
    lines.push([`"00${i % 40}"`, i % 100, (i % 100) + 1.5, `S${i}`, i % 2 ? "FA-AA" : "ME-MS61", au, cu, i % 23 === 0 ? "1e3" : i % 29 === 0 ? " 12 " : i % 31 === 0 ? "+5" : String(i % 7), i % 37 === 0 ? "TRUE" : "false", i % 41 === 0 ? "2022-05-01T10:00:00Z" : "2022-05-01"].join(","));
  }
  return lines.join("\n") + "\n# GeoStrix export stamp\n";
}

test("#611 columnar rows give exactly the row reader's values (numbers, <DL text, blanks, booleans, dates, ids)", () => {
  const text = assayCsv(5000);
  const old = parseTableText(text);
  const col = parseTableColumns(text);
  assert.ok(col && col.columnar);
  assert.deepEqual(col.headers, old.headers);
  assert.equal(col.rows.length, old.rows.length);
  for (let i = 0; i < old.rows.length; i++) for (const h of old.headers) assert.ok(same(old.rows[i][h], col.rows[i][h]), `row ${i} ${h}: ${old.rows[i][h]} vs ${col.rows[i][h]}`);
  assert.equal(col.rows[1].hole_id, "001"); // identifier column kept as text (#509)
  assert.deepEqual(col.rows.slice(0, 3).map((r) => r.au_ppm), old.rows.slice(0, 3).map((r) => r.au_ppm)); // array methods work
  assert.deepEqual(Object.keys(col.rows[0]), []); // documented: no own keys — callers use `headers`
});

test("#611 not eligible -> null, so the normal reader runs (semicolons, ragged rows, duplicate headers, comma decimals)", () => {
  assert.equal(parseTableColumns("a;b\n1;2\n"), null);
  assert.equal(parseTableColumns("a,b\n1,2\n3\n"), null);
  assert.equal(parseTableColumns("a,a\n1,2\n"), null);
  assert.equal(parseTableColumns('a,b\n"1,5",2\n'), null);
  // parseTableText only switches for big text, and falls back silently
  const small = parseTableText("a,b\n1,2\n", { columnar: true });
  assert.equal(small.columnar, undefined);
  assert.equal(small.rows[0].a, 1);
});
