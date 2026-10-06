// TASKS.csv #555 — assays / interval layers as exact columns in the project file.
import test from "node:test";
import assert from "node:assert/strict";
import { compactTable, expandTable, compactIntervalLayers, expandIntervalLayers, COMPACT_TABLE_MIN_ROWS } from "../src/lib/compactTable.js";
import { payloadFromFields, fieldsFromPayload, emptyFields } from "../src/lib/projectFields.js";

const viaJson = (x) => JSON.parse(JSON.stringify(x));

function assays(n) {
  const rows = [];
  for (let i = 0; i < n; i++) {
    const r = { hole_id: `DDH-${String(i % 37).padStart(3, "0")}`, from: (i % 200) * 1.5, to: (i % 200) * 1.5 + 1.5, values: { Au: Math.round(Math.random() * 1e4) / 1e3, Cu: i % 11 === 0 ? undefined : i * 0.37, As: i % 7 === 0 ? "<5" : i % 5 }, source: "assay" };
    if (r.values.Cu === undefined) delete r.values.Cu;
    if (i % 13 === 0) r.sample_id = `S${i}`;
    if (i % 17 === 0) r.qualifiers = { Au: "<", note: null };
    if (i % 19 === 0) r.to = null; // explicit null stays null
    if (i % 23 === 0) r.from = NaN; // NaN is written as null, exactly as before
    if (i % 29 === 0) delete r.values; // a row with no values object at all
    if (i % 31 === 0) r.values = {}; // ... and one with an empty one
    rows.push(r);
  }
  return rows;
}

test("#555 round trip is exact: numbers, text, nulls, absent keys, nested qualifiers", () => {
  const rows = assays(COMPACT_TABLE_MIN_ROWS + 500);
  const c = compactTable(rows);
  assert.equal(c.__compactTable, 1);
  assert.deepEqual(expandTable(viaJson(c)), viaJson(rows));
  assert.equal(compactTable(rows), c); // cached: an autosave re-encodes nothing
  assert.equal(compactTable(rows.slice(0, 10)).length, 10); // small tables stay plain rows
});

test("#555 smaller on disk (Harry-like 63k assays)", () => {
  const rows = assays(63000);
  const plain = JSON.stringify(rows).length, compact = JSON.stringify(compactTable(rows)).length;
  assert.ok(compact < plain * 0.6, `compact ${compact} vs plain ${plain}`);
});

test("#555 project save/load: assays and a big interval layer compact, older plain files still open", () => {
  const live = emptyFields();
  live.assays = assays(3000);
  live.layers = { ...live.layers, litho: Array.from({ length: 2500 }, (_, i) => ({ hole_id: `H${i % 40}`, from: i, to: i + 1, value: i % 3 ? "AND" : "BAS" })), alt: [{ hole_id: "H1", from: 0, to: 1, value: "SER" }] };
  const file = viaJson(payloadFromFields(live));
  assert.equal(file.assays.__compactTable, 1);
  assert.equal(file.layers.litho.__compactTable, 1);
  assert.ok(Array.isArray(file.layers.alt)); // small layer stays plain
  const back = fieldsFromPayload(file);
  assert.deepEqual(back.assays, viaJson(live.assays));
  assert.deepEqual(back.layers.litho, live.layers.litho);
  // a v9 file (plain rows) still opens
  const old = fieldsFromPayload({ version: 9, assays: viaJson(live.assays.slice(0, 5)), layers: { litho: [{ hole_id: "H", from: 0, to: 1, value: "X" }] } });
  assert.equal(old.assays.length, 5);
  assert.equal(old.layers.litho[0].value, "X");
  assert.equal(expandIntervalLayers(compactIntervalLayers(live.layers)).litho.length, 2500);
});
