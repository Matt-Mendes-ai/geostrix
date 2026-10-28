// TASKS.csv #1112 — the OMF writer's int64 / float64 arrays filled in a loop, not .from(a, mapper)
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeOMF } from "../src/lib/omfWriter.js";
import { parseOMF } from "../src/lib/omf.js";

test("#1112 OMF int64 triangle indices round-trip exactly (beyond 2^32, NaN vertices kept)", async () => {
  const tri = [0, 1, 2, 4294967296 + 7, 2 ** 40 + 3, 123456789];
  const bytes = await writeOMF({ elements: [{ type: "surface", name: "s", vertices: [0, 0, 0, 1, 0, 0, 0, 1, NaN], triangles: tri }] });
  const p = await parseOMF(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  assert.deepEqual(Array.from(p.elements[0].triangles, Number), tri);
  assert.ok(Number.isNaN(Array.from(p.elements[0].vertices).at(-1)));
});

test("#1112 a 1M-triangle surface writes without the per-index BigInt pass", async () => {
  const n = 3e6, triangles = new Int32Array(n);
  for (let i = 0; i < n; i++) triangles[i] = i % 500000;
  const vertices = new Float64Array(1.5e6);
  const t0 = performance.now();
  await writeOMF({ elements: [{ type: "surface", name: "big", vertices, triangles }] });
  const ms = performance.now() - t0;
  assert.ok(ms < 4000, `${ms} ms`); // includes zlib; the old BigInt64Array.from alone was ~1.4 s
});
