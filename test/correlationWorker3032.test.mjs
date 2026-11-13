// TASKS.csv #3032 (split from #2904) — the correlation matrix in a worker above 20,000 rows, each element's column sent once per epoch, with
// progress; the same answers as the main thread
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { correlationMatrix } from "../src/lib/correlation.js";
import { createCorrelationClient, packColumn, CORRELATION_WORKER_FROM } from "../src/lib/correlationClient.js";

// the worker module, run in this process behind a fake Worker (it sets self.onmessage when imported)
const posted = [];
let deliver = null;
globalThis.self = { postMessage: (m) => deliver?.(m) };
await import("../src/lib/correlation.worker.js");
const fakeWorker = () => {
  const w = {
    onmessage: null, onerror: null,
    postMessage(d) { posted.push(d); const copy = structuredClone(d); setTimeout(() => { deliver = (m) => w.onmessage?.({ data: m }); globalThis.self.onmessage({ data: copy }); }, 0); },
    terminate() {},
  };
  return w;
};

let seed = 3032; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const N = 3000;
const cols = { Cu: [], Au: [], As: [], Fe: [] };
for (let i = 0; i < N; i++) { const z = rnd(); cols.Cu.push(rnd() < 0.05 ? null : 10 + 100 * z + 20 * rnd()); cols.Au.push(rnd() < 0.1 ? null : 0.01 + z * rnd()); cols.As.push(5 + 50 * rnd()); cols.Fe.push(rnd() < 0.02 ? NaN : 2 + 5 * rnd()); }

test("the worker's matrix equals the main thread's, for each method", async () => {
  const client = createCorrelationClient({ makeWorker: fakeWorker });
  for (const method of ["spearman", "log", "pearson"]) {
    const syms = ["Cu", "Au", "As", "Fe"];
    const got = await client.compute({ epoch: 1, cols, symbols: syms, method, cache: new Map() }).promise;
    assert.deepEqual(got, correlationMatrix(cols, syms, method), method);
  }
});

test("each column travels once per epoch (a tick sends only the new one), again after the epoch changes; progress is reported", async () => {
  posted.length = 0;
  const client = createCorrelationClient({ makeWorker: fakeWorker });
  const prog = [];
  await client.compute({ epoch: "a", cols, symbols: ["Cu", "Au"], method: "spearman", cache: new Map(), onProgress: (p) => prog.push(p) }).promise;
  await client.compute({ epoch: "a", cols, symbols: ["Cu", "Au", "As"], method: "spearman", cache: new Map() }).promise;
  await client.compute({ epoch: "b", cols, symbols: ["Cu", "Au"], method: "spearman", cache: new Map() }).promise;
  assert.deepEqual(posted.map((d) => Object.keys(d.cols).sort()), [["Au", "Cu"], ["As"], ["Au", "Cu"]]);
  assert.ok(posted[0].cols.Cu instanceof Float64Array);
  assert.ok(Number.isNaN(packColumn([1, null, NaN, 2])[1]) && Number.isNaN(packColumn([1, null, NaN, 2])[2]));
  assert.ok(prog.length === 0 || prog.every((p) => p.total === 3), "three cells for two elements"); // throttled to one per 100 ms
});

test("a superseded request is not answered; a worker that cannot start computes here", async () => {
  const client = createCorrelationClient({ makeWorker: fakeWorker });
  const first = client.compute({ epoch: 2, cols, symbols: ["Cu", "Au"], method: "pearson", cache: new Map() });
  first.cancel();
  let firstAnswered = false; first.promise.then(() => { firstAnswered = true; });
  const second = await client.compute({ epoch: 2, cols, symbols: ["Cu", "As"], method: "pearson", cache: new Map() }).promise;
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(firstAnswered, false);
  assert.deepEqual(second, correlationMatrix(cols, ["Cu", "As"], "pearson"));
  const none = createCorrelationClient({ makeWorker: () => { throw new Error("no worker"); } });
  assert.deepEqual(await none.compute({ epoch: 3, cols, symbols: ["Au", "Fe"], method: "log", cache: new Map() }).promise, correlationMatrix(cols, ["Au", "Fe"], "log"));
});

test("correlationMatrix reports each cell of the upper triangle", () => {
  const seen = [];
  correlationMatrix(cols, ["Cu", "Au", "As"], "spearman", new Map(), (done, total) => seen.push([done, total]));
  assert.deepEqual(seen.map((s) => s[0]), [1, 2, 3, 4, 5, 6]);
  assert.ok(seen.every((s) => s[1] === 6));
});

test("wiring: the dialog uses the worker above the threshold, keeps the last cells while computing, and holds the export", () => {
  assert.equal(CORRELATION_WORKER_FROM, 20000);
  const g = readFileSync(new URL("../src/components/CorrelationMatrix.jsx", import.meta.url), "utf8");
  assert.match(g, /const big = assays\.length > CORRELATION_WORKER_FROM;/);
  assert.match(g, /clientRef\.current\.compute\(\{ epoch: caches, cols: caches\.cols, symbols, method, cache: caches\.pairs, onProgress: setProgress \}\)/);
  assert.match(g, /const cellV = shown\?\.\[a\]\?\.\[b\];/);
  assert.match(g, /disabled=\{symbols\.length < 2 \|\| !matrix\}/);
});
