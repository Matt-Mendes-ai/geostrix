// TASKS.csv #3125 (split from #3032) — Correlation on a large table built every element column (valueIn on each row, and the below-detection
// flags) in one blocking pass before the worker started: about 1 s at 147,000 samples x 12 elements. Above CORRELATION_WORKER_FROM rows the
// columns are built in slices of about 12 ms with a pause between them (lib buildColumns)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildColumns } from "../src/lib/correlationClient.js";

const rows = Array.from({ length: 50000 }, (_, i) => ({ values: { A: i % 13, B: i % 7 === 0 ? 0.5 : i / 10 }, lt: i % 7 === 0 }));
const valueOf = (r, s) => r.values[s];
const ltOf = (r, s) => s === "B" && r.lt;

test("the same columns as one pass, with a pause each time a slice has used its time budget", async () => {
  let pauses = 0, clock = 0;
  const cols = {}, lt = {};
  // a clock that moves 10 ms per reading, a 15 ms budget: a pause every second block of rows
  const done = await buildColumns({ rows, symbols: ["A", "B"], cols, lt, valueOf, ltOf, chunk: 10000, budget: 15, now: () => (clock += 10), pause: async () => { pauses++; } });
  assert.equal(done, true);
  assert.deepEqual(cols.A, rows.map((r) => r.values.A));
  assert.deepEqual(cols.B, rows.map((r) => r.values.B));
  assert.deepEqual([...lt.B], rows.map((r) => (r.lt ? 1 : 0)));
  assert.equal(lt.A.every((x) => x === 0), true);
  assert.equal(pauses, 5, "10 blocks, a pause after every second one");
  let none = 0;
  await buildColumns({ rows, symbols: ["A"], cols: {}, lt: {}, valueOf, ltOf, budget: Infinity, pause: async () => { none++; } });
  assert.equal(none, 0, "within the budget: no pause");
});

test("detected pairs only: a below-detection value is left out of its column", async () => {
  const cols = {}, lt = {};
  await buildColumns({ rows, symbols: ["B"], cols, lt, valueOf, ltOf, detectedOnly: true, pause: async () => {} });
  assert.equal(cols.B[0], null); assert.equal(cols.B[1], 0.1);
});

test("a column already built is kept; a cancelled build stores no part-built column", async () => {
  const cols = { A: ["kept"] }, lt = { A: new Uint8Array(1) };
  let n = 0;
  const done = await buildColumns({ rows, symbols: ["A", "B"], cols, lt, valueOf, ltOf, chunk: 10000, budget: 0, pause: async () => { n++; }, cancelled: () => n >= 2 });
  assert.equal(done, false);
  assert.deepEqual(cols.A, ["kept"]);
  assert.equal(cols.B, undefined); assert.equal(lt.B, undefined);
});

test("wiring: the worker path builds the columns in slices, and a closed dialog stops the build", () => {
  const s = readFileSync(new URL("../src/components/CorrelationMatrix.jsx", import.meta.url), "utf8");
  assert.match(s, /buildColumns\(\{ rows: assays, symbols, cols: caches\.cols, lt: caches\.lt, valueOf: \(a, s\) => valueIn\(a, s, "ppm", elementUnits\), ltOf: isBelowDetection, detectedOnly, cancelled: \(\) => stopped \}\)/);
  assert.match(s, /return \(\) => \{ stopped = true; req\?\.cancel\(\); \};/);
});
