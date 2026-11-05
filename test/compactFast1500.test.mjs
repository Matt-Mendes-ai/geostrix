// TASKS.csv #1500 — the fast column reader returns exactly what Number() does, and expandTable rows are unchanged
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseNumberList, compactTable, expandTable } from "../src/lib/compactTable.js";

const same = (a, b) => Object.is(a, b);

test("bit for bit against Number() on random doubles of every magnitude and on lab-style values", () => {
  const vals = [0, -0, 1, -1, 0.1, 0.2, 0.3, 1e-7, 2.5e-7, -3.14e-9, 1e21, 1.5e22, 1e23, 9007199254740993, 2 ** 53, 123456789012345, 1234567890123456, 0.000123, 5e-324, 1.7976931348623157e308, 12.345, 0.0049, 3410.5, -61.75];
  const buf = new DataView(new ArrayBuffer(8));
  let seed = 12345; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let k = 0; k < 20000; k++) { // random bit patterns
    buf.setUint32(0, Math.floor(rnd() * 2 ** 32)); buf.setUint32(4, Math.floor(rnd() * 2 ** 32));
    const v = buf.getFloat64(0); if (Number.isFinite(v)) vals.push(v);
  }
  for (let k = 0; k < 20000; k++) vals.push(Math.round(rnd() * 10 ** Math.floor(rnd() * 8)) / 10 ** Math.floor(rnd() * 6) * (rnd() < 0.2 ? -1 : 1)); // assay-like
  const str = vals.map(String).join(",");
  const out = parseNumberList(str, vals.length);
  for (let i = 0; i < vals.length; i++) assert.ok(same(out[i], Number(String(vals[i]))), `${String(vals[i])} read as ${out[i]}`);
});

test("absent cells are NaN, wherever they sit", () => {
  const out = parseNumberList(",5,,-2.5,", 5);
  assert.ok(Number.isNaN(out[0])); assert.equal(out[1], 5); assert.ok(Number.isNaN(out[2])); assert.equal(out[3], -2.5); assert.ok(Number.isNaN(out[4]));
  const short = parseNumberList("1,2", 4); assert.ok(Number.isNaN(short[2]) && Number.isNaN(short[3]));
});

test("a table round-trips: numbers, absent fields, dictionary strings, nested values and object copies", () => {
  const rows = [];
  for (let i = 0; i < 2500; i++) {
    const r = { hole_id: `H${i % 37}`, from: i * 1.5, to: i * 1.5 + 1.5, values: { Au: i % 11 === 0 ? undefined : (i * 0.0137) % 9, Cu: -0 + i * 1e-7 } };
    if (i % 5 === 0) r.source = "pxrf";
    if (i % 7 === 0) r.qual = { Au: "<" };
    if (r.values.Au === undefined) delete r.values.Au;
    if (i % 13 === 0) delete r.values;
    rows.push(r);
  }
  const back = expandTable(JSON.parse(JSON.stringify(compactTable(rows))));
  assert.deepEqual(back, rows);
  assert.notEqual(back[0].qual, back[7].qual, "object values are copies per row");
  assert.deepEqual(Object.keys(back[5]), ["hole_id", "from", "to", "source", "values"], "the nested values last, as before");
});
