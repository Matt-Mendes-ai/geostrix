// TASKS.csv #1041 (review #1016) — the direct block-model CSV writer gives exactly the text blockModelRows + toExportCsv
// (Papa.unparse) gave, without an object per block.
import test from "node:test";
import assert from "node:assert/strict";
import { blockModelRows, blockModelCsvChunks, blockModelCsvTextSync, blockModelCsvText } from "../src/lib/blockModelExport.js";
import { toExportCsv } from "../src/lib/tabular.js";

const old = (model, names) => toExportCsv(blockModelRows(model, names));

test("#1041 same text as before: every optional column, first-seen column order, quoting, formula cells, odd values", () => {
  const cells = [
    { x: 463000.12345, y: 6178000.9999, z: 1000.0005, dx: 3.3329999446868896, dy: 25, dz: 10, value: 1.5 }, // no optional fields
    { x: 1, y: 2, z: 3, dx: 1, dy: 1, dz: 1, value: 0.1 + 0.2, support: "Measured", supportIndex: 0.87654321 },
    { x: 1, y: 2, z: 3, dx: 1, dy: 1, dz: 1, value: NaN, nSamples: 8, nHoles: 3, coverage: 0.333333, support: 0.123456 },
    { x: -5.5, y: 2, z: 3, dx: 1, dy: 1, dz: 1, value: null, support: "Inferred, low" }, // a comma: quoted
    { x: 1, y: 2, z: 3, dx: 1, dy: 1, dz: 1, value: "=SUM(A1)", support: "say \"hi\"" }, // formula + quotes
    { x: 1, y: 2, z: 3, dx: 1, dy: 1, dz: 1, value: -0.004, support: " pad " },
    { x: 1e-7, y: 2, z: 3, dx: 1, dy: 1, dz: 1, value: 1e21, supportIndex: Infinity },
  ];
  const model = { name: "Au", params: { element: "Au", unit: "g/t" }, cells };
  assert.equal(blockModelCsvTextSync(model), old(model));
  assert.equal(blockModelCsvTextSync(model, "micromine"), old(model, "micromine"));
  const kv = { name: "kv", source: "kriging-variance", params: { element: "Cu", unit: "%" }, cells: cells.slice(0, 2) };
  assert.equal(blockModelCsvTextSync(kv), old(kv));
  assert.equal(blockModelCsvTextSync({ name: "e", cells: [] }), old({ name: "e", cells: [] }));
});

test("#1041 chunks join to the same text; the async version too", async () => {
  const cells = Array.from({ length: 1234 }, (_, i) => ({ x: i * 25.5, y: 6e6 + i, z: 900 - i * 0.25, dx: 25, dy: 25, dz: 5, value: (i % 17) / 3, nSamples: i % 9, nHoles: i % 4, support: ["Measured", "Indicated", "Inferred"][i % 3] }));
  const model = { name: "big", params: { element: "Cu", unit: "%" }, cells };
  const parts = [...blockModelCsvChunks(model, "datamine", 100)];
  assert.equal(parts.length, Math.ceil(1235 / 100));
  assert.equal(parts.join("\r\n"), old(model));
  assert.equal(await blockModelCsvText(model), old(model));
});

test("#1041 1M blocks write in seconds, not half a minute", () => {
  const n = 1000000, cells = new Array(n);
  for (let i = 0; i < n; i++) cells[i] = { x: 460000 + (i % 100) * 10, y: 6170000 + ((i / 100) | 0) % 100 * 10, z: 1000 - ((i / 10000) | 0) * 5, dx: 10, dy: 10, dz: 5, value: (i % 997) / 100, nSamples: 6, nHoles: 2 };
  const t0 = performance.now();
  const text = blockModelCsvTextSync({ name: "1M", params: { element: "Au", unit: "ppm" }, cells });
  const ms = performance.now() - t0;
  assert.ok(ms < 12000, `${ms.toFixed(0)} ms`); // was ~33 s (review #1016); about 2-4 s here
  assert.equal(text.split("\r\n").length, n + 1);
});
