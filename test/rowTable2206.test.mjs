// TASKS.csv #2206 Phase 2 — lib/rowTable.js: a table as typed columns, its rows derived on demand. Pinned against compactTable / expandTable
// (#555), which the project file and today's rows come from: the same file text both ways, the same rows, the same row objects every call.
import test from "node:test";
import assert from "node:assert/strict";
import v8 from "node:v8";
import vm from "node:vm";
import { compactTable, expandTable } from "../src/lib/compactTable.js";
import { tableFromRows, tableFromCompact, compactFromTable, rowsOf, rowOf, colOf, valuesOf, cellOf, isTable, lengthOf } from "../src/lib/rowTable.js";

const EL = ["Au", "Ag", "Cu", "As"];
// awkward on purpose: absent fields, null, NaN / Infinity, a mixed number / string column, booleans, qualifier objects, an element absent
function awkward(n, { badValues = false } = {}) {
  return Array.from({ length: n }, (_, i) => {
    const r = { hole_id: `H${i % 37}`, from: i * 0.5, to: i * 0.5 + 0.5 };
    if (i % 5) r.sample_id = `S${i}`;
    if (i % 7 === 0) r.note = null;
    if (i % 11 === 0) r.flag = i % 22 === 0;
    r.mixed = i % 3 ? i * 1.25 : `x${i % 4}`;
    if (i % 13 === 0) r.grade = i % 26 === 0 ? NaN : Infinity; else r.grade = (i % 17) / 3;
    if (i % 9 === 0) r.qualifiers = { Au: "<", ...(i % 18 === 0 ? { Ag: ">" } : {}) };
    if (badValues && i % 501 === 0) r.values = "not an object"; else if (i % 19) r.values = Object.fromEntries(EL.filter((_, k) => (i + k) % 6).map((e, k) => [e, ((i * (k + 2)) % 97) / 10]));
    return r;
  });
}
const json = (x) => JSON.stringify(x);

for (const opts of [{}, { badValues: true }]) {
  test(`rows -> table -> the file: the same text as compactTable(rows); table -> rows: expandTable's rows${opts.badValues ? " (a non-object values: no nested columns)" : ""}`, () => {
    const rows = awkward(3000, opts);
    const t = tableFromRows(rows);
    assert.ok(isTable(t) && t.length === 3000);
    assert.equal(!!t.nested, !opts.badValues);
    const stored = compactTable(rows);
    assert.equal(json(compactFromTable(t)), json(stored), "the file text");
    const want = expandTable(JSON.parse(json(stored)));
    assert.deepEqual(rowsOf(t), want, "the rows");
  });
}

test("the file's columns -> table (no rows built) -> rows equal expandTable; back to the same text", () => {
  const text = json(compactTable(awkward(2500)));
  const t = tableFromCompact(JSON.parse(text));
  assert.ok(isTable(t));
  assert.deepEqual(rowsOf(t), expandTable(JSON.parse(text)));
  assert.equal(json(compactFromTable(t)), text);
  // older files / small tables: rows -> a table
  const small = awkward(50);
  assert.deepEqual(json(rowsOf(tableFromCompact(small))), json(expandTable(JSON.parse(json(compactTable([...small, ...awkward(2000)])))).slice(0, 50)), "a small table's rows are what expandTable gives for the same rows");
});

test("rowsOf: the same row objects every call; an array passes through; a qualifier object is a copy per row", () => {
  const t = tableFromRows(awkward(2400));
  const a = rowsOf(t), b = rowsOf(t);
  assert.equal(a, b);
  assert.equal(compactFromTable(t), compactFromTable(t), "the table's file form is kept per table");
  const arr = [{ x: 1 }];
  assert.equal(rowsOf(arr), arr);
  assert.notEqual(a[0].qualifiers, a[18].qualifiers);
  assert.deepEqual(a[0].qualifiers, a[18].qualifiers);
  assert.deepEqual(rowOf(t, 5), a[5]); assert.notEqual(rowOf(t, 5), a[5], "rowOf builds its own");
  assert.equal(lengthOf(t), 2400); assert.equal(lengthOf(arr), 1); assert.equal(lengthOf(null), 0);
});

test("columns for hot readers: numbers as a Float64Array (NaN = absent), codes for the rest, an element's column, a cell as the row holds it", () => {
  const rows = awkward(2200), t = tableFromRows(rows), r = rowsOf(t);
  const from = colOf(t, "from");
  assert.ok(from.num instanceof Float64Array);
  assert.equal(from.num[10], 5);
  const hole = colOf(t, "hole_id");
  assert.ok(hole.codes instanceof Int32Array && hole.dict.includes("H3"));
  const au = valuesOf(t, "Au");
  for (let i = 0; i < 2200; i += 7) assert.equal(cellOf(au, i), r[i].values?.Au);
  for (let i = 0; i < 2200; i += 13) { assert.deepEqual(cellOf(colOf(t, "grade"), i), r[i].grade); assert.equal(cellOf(colOf(t, "note"), i), r[i].note); }
  assert.equal(colOf(t, "nope"), null); assert.equal(valuesOf(t, "Zn"), null); assert.equal(colOf(rows, "from"), null, "not a table");
});

test("a small table writes its rows, as compactTable leaves a small array", () => {
  const t = tableFromRows(awkward(40));
  assert.deepEqual(compactFromTable(t), rowsOf(t));
  assert.ok(Array.isArray(compactFromTable(t)));
});

test("memory: 200,000 assay rows x 10 elements as a table take a fraction of the row objects' heap", () => {
  v8.setFlagsFromString("--expose-gc");
  const gc = vm.runInNewContext("gc");
  const els = ["Au", "Ag", "Cu", "Pb", "Zn", "As", "Sb", "Bi", "Mo", "S"];
  const make = () => Array.from({ length: 200000 }, (_, i) => ({ hole_id: `RH${i % 10544}`, from: i * 2, to: i * 2 + 2, sample_id: `S${i}`, values: Object.fromEntries(els.map((e, k) => [e, ((i * (k + 3)) % 997) / 100])) }));
  gc(); const h0 = process.memoryUsage().heapUsed;
  let rows = make(); gc(); const hRows = process.memoryUsage().heapUsed - h0;
  const t = tableFromRows(rows); rows = null; gc(); const hTable = process.memoryUsage().heapUsed - h0;
  assert.equal(t.length, 200000);
  console.log(`rows ${(hRows / 1048576).toFixed(0)} MB, table ${(hTable / 1048576).toFixed(0)} MB`);
  assert.ok(hTable < hRows / 2, `table ${(hTable / 1048576).toFixed(0)} MB vs rows ${(hRows / 1048576).toFixed(0)} MB`);
});
