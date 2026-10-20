// TASKS.csv #583 — the worker split of the columnar reader gives the same rows; mapInChunks equals map.
import test from "node:test";
import assert from "node:assert/strict";
import { parseTableColumns, parseColumnsRaw, rowsFromColumns, parseTableText } from "../src/lib/tabular.js";
import { mapInChunks } from "../src/lib/mapInChunks.js";

const csv = "hole_id,from,to,Au_ppm,code\nDH-001,0,1.5,0.12,A\nDH-001,1.5,3,,<0.005\n0045,3,4.5,1e3,B\n";

test("#583 parseColumnsRaw -> structuredClone -> rowsFromColumns equals parseTableColumns", () => {
  const direct = parseTableColumns(csv);
  const viaWorker = rowsFromColumns(structuredClone(parseColumnsRaw(csv))); // what crossing to/from a worker does
  assert.deepEqual(viaWorker.headers, direct.headers);
  const plain = (rows, hs) => rows.map((r) => Object.fromEntries(hs.map((h) => [h, r[h]])));
  assert.deepEqual(plain(viaWorker.rows, viaWorker.headers), plain(direct.rows, direct.headers));
  // and equals the ordinary row reader
  const t = parseTableText(csv);
  assert.deepEqual(plain(viaWorker.rows, t.headers), plain(t.rows, t.headers));
  assert.equal(viaWorker.rows[2].hole_id, "0045"); // #509 identifiers stay text
});

test("#583 mapInChunks gives exactly rows.map", async () => {
  const rows = Array.from({ length: 20003 }, (_, i) => i);
  let progress = 0;
  const out = await mapInChunks(rows, (x, i) => x * 2 + i, { chunk: 1000, onProgress: (f) => { progress = f; } });
  assert.deepEqual(out, rows.map((x, i) => x * 2 + i));
  assert.ok(progress > 0.9 && progress < 1);
});
