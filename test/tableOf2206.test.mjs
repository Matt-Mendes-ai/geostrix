// TASKS.csv #2206 Phase 2 (Main's conditions) — tableOf(rows): the columns of a rows array the store keeps, without changing the rows. (1) Row
// identity: rowsOf(tableOf(rows)) is those very rows, so an edit keeps the untouched rows the same objects. (2) Edit cost: an edit of a few rows
// patches the previous table (copy-on-write of the touched columns), and an Undo finds the old table again; neither rebuilds the columns.
import test from "node:test";
import assert from "node:assert/strict";
import { compactTable, expandTable } from "../src/lib/compactTable.js";
import { rowsOf, colOf, valuesOf, cellOf } from "../src/lib/rowTable.js"; import { tableOf, tableFromRows } from "../src/lib/rowTableBuild.js";

const EL = ["Au", "Ag", "Cu", "Pb", "Zn", "As", "Sb", "Bi", "Mo", "S"];
const assays = (n, els = EL) => Array.from({ length: n }, (_, i) => ({ hole_id: `RH${i % 997}`, from: i * 2, to: i * 2 + 2, sample_id: `S${i}`, values: Object.fromEntries(els.map((e, k) => [e, ((i * (k + 3)) % 997) / 100])), ...(i % 9 === 0 ? { qualifiers: { Au: "<" } } : {}) }));

// every cell of the table equals the row's value (the dictionary order may differ from a fresh build: only the values matter to a reader)
function sameCells(t, rows) {
  assert.equal(t.length, rows.length);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    for (const k of t.keys) assert.deepEqual(cellOf(colOf(t, k), i), r[k], `row ${i} ${k}`);
    for (const k in r) if (k !== "values") assert.ok(t.keys.includes(k), `row ${i}: ${k} has a column`);
    if (t.nested) for (const k of t.nested.keys) assert.deepEqual(cellOf(valuesOf(t, k), i), r.values?.[k], `row ${i} values.${k}`);
  }
}

test("(1) identity: the table's rows are the very rows given; after an edit the untouched rows are the same objects", () => {
  const rows = assays(3000), t = tableOf(rows);
  assert.equal(rowsOf(t), rows, "the same array");
  assert.equal(tableOf(rows), t, "kept per array");
  const edited = rows.slice(); edited[17] = { ...rows[17], values: { ...rows[17].values, Au: 99.5 } };
  const t2 = tableOf(edited);
  assert.equal(rowsOf(t2), edited);
  for (let i = 0; i < rows.length; i++) if (i !== 17) assert.equal(rowsOf(t2)[i], rowsOf(t)[i], `row ${i} kept`);
  assert.equal(cellOf(valuesOf(t2, "Au"), 17), 99.5);
  assert.equal(cellOf(valuesOf(t, "Au"), 17), rows[17].values.Au, "the old table is unchanged (copy-on-write)");
  assert.equal(colOf(t2, "hole_id"), colOf(t, "hole_id"), "an untouched column is shared, not copied");
});

test("patched tables read the same as the rows, over a run of random edits (numbers, new text, absent fields, objects, elements)", () => {
  let rows = assays(4000);
  tableOf(rows);
  let s = 11; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let step = 0; step < 25; step++) {
    const next = rows.slice();
    for (let e = 0; e < 1 + Math.floor(rnd() * 20); e++) {
      const i = Math.floor(rnd() * next.length), r = { ...next[i] }, kind = step % 6;
      if (kind === 0) r.from = r.from + 0.5;
      else if (kind === 1) r.hole_id = `NEW${step}_${e}`;
      else if (kind === 2) delete r.sample_id;
      else if (kind === 3) r.qualifiers = { Ag: ">", step };
      else if (kind === 4) { r.values = { ...r.values }; delete r.values.Cu; r.values.Au = rnd(); }
      else r.to = r.to * 2;
      next[i] = r;
    }
    const t = tableOf(next);
    assert.equal(rowsOf(t), next);
    sameCells(t, next);
    rows = next;
  }
});

test("an edit that does not fit the columns is rebuilt, and still reads right: a new field, text in a number column, a delete", () => {
  const rows = assays(2500); tableOf(rows);
  const a = rows.slice(); a[3] = { ...rows[3], lab: "ALS" }; sameCells(tableOf(a), a);
  const b = rows.slice(); b[4] = { ...rows[4], from: "n/a" }; sameCells(tableOf(b), b);
  const c = rows.slice(5); sameCells(tableOf(c), c);
  assert.equal(rowsOf(tableOf(c)), c);
});

test("after an open (rows decoded from the file) the table is a decode of the same columns, exact", () => {
  const text = JSON.stringify(compactTable(assays(3000)));
  const rows = expandTable(JSON.parse(text)); // what the store holds after an open
  const t = tableOf(rows);
  assert.equal(rowsOf(t), rows);
  sameCells(t, rows);
});

test("(2) cost at 200,000 assays x 10 elements: a one-cell edit and its Undo against a full rebuild", () => {
  const rows = assays(200000);
  let t0 = performance.now(); const full = tableFromRows(rows); const tFull = performance.now() - t0;
  const t = tableOf(rows);
  const edited = rows.slice(); edited[123456] = { ...rows[123456], values: { ...rows[123456].values, Cu: 7.25 } };
  t0 = performance.now(); const t2 = tableOf(edited); const tEdit = performance.now() - t0;
  t0 = performance.now(); const back = tableOf(rows); const tUndo = performance.now() - t0;
  assert.equal(back, t, "Undo: the old rows' table, as it was");
  assert.equal(cellOf(valuesOf(t2, "Cu"), 123456), 7.25);
  assert.equal(full.length, 200000);
  console.log(`full build ${tFull.toFixed(0)} ms; one-cell edit ${tEdit.toFixed(1)} ms; undo ${tUndo.toFixed(2)} ms`);
  assert.ok(tEdit < tFull / 5, `edit ${tEdit.toFixed(0)} ms vs a rebuild ${tFull.toFixed(0)} ms`);
  assert.ok(tUndo < 5);
});
