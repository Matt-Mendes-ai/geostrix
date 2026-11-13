// TASKS.csv #3118 (review #2876, WA iron) — the first project change after a restore serialized the whole project for the autosave (4.0 s:
// compactTable of 150,455 litho rows and 148,000 assays, a cold cache). The stored tables seed the encode caches as they are decoded.
import test from "node:test";
import assert from "node:assert/strict";
import { compactTable, expandTable } from "../src/lib/compactTable.js";
import { compactPointRows, expandPointRows } from "../src/lib/compactRows.js";
import { projectParts, joinParts, fieldsFromPayload, emptyFields } from "../src/lib/projectFields.js";

const assayRows = (n) => Array.from({ length: n }, (_, k) => ({ hole_id: `H${k % 97}`, from: k % 50, to: (k % 50) + 1, values: { Fe: 30 + (k % 350) / 10, SiO2: (k % 600) / 10 }, source: "assay" }));

test("a decoded table's encoding is the stored table itself, and stays exact", () => {
  const rows = assayRows(5000), stored = JSON.parse(JSON.stringify(compactTable(rows)));
  const back = expandTable(stored);
  assert.equal(compactTable(back), stored, "the stored table, not a new encoding");
  assert.deepEqual(back, rows);
  // a changed table (a new array, rows immutable: #721) is encoded afresh
  const edited = back.map((r, i) => (i === 3 ? { ...r, values: { ...r.values, Fe: 99 } } : r));
  const c = compactTable(edited);
  assert.notEqual(c, stored);
  assert.deepEqual(expandTable(JSON.parse(JSON.stringify(c)))[3].values.Fe, 99);
  const pts = Array.from({ length: 3000 }, (_, i) => ({ x: 500000 + i, y: 7000000 + i / 2, z: 400, value: i % 77, _src: "mag.csv" }));
  const ps = JSON.parse(JSON.stringify(compactPointRows(pts)));
  assert.equal(compactPointRows(expandPointRows(ps)), ps);
});

test("the first autosave after a restore writes the same text, without encoding the tables again", () => {
  const live = { ...emptyFields(), assays: assayRows(20000) };
  live.layers = { ...live.layers, litho: Array.from({ length: 20000 }, (_, k) => ({ hole_id: `H${k % 97}`, from: k % 50, to: (k % 50) + 1, value: ["BIF", "SHL", "CAN"][k % 3] })) };
  const text = joinParts(projectParts(live));
  const restored = fieldsFromPayload(JSON.parse(text), live.project?.name);
  const a = performance.now();
  const again = joinParts(projectParts({ ...restored, collars: restored.collars.slice() }));
  const ms = performance.now() - a;
  assert.equal(again, text);
  assert.ok(ms < 400, `${Math.round(ms)} ms`); // was a full encode of both tables
});
