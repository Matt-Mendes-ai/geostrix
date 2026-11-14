// TASKS.csv #3232 (split from #3174) — the dialog's epoch is its caches object ({ cols, lt, pairs }: every column as a plain array). It was
// posted to the worker with each request: a structured clone of all the columns on the main thread (about 480 ms at 147,000 samples x 12
// elements), and a new object on the worker's side every time, so the worker dropped its columns on each request and a tick (which sends
// only the new column) computed the earlier pairs without them. The client now posts a number per epoch.
import test from "node:test";
import assert from "node:assert/strict";
import { correlationMatrix } from "../src/lib/correlation.js";
import { createCorrelationClient } from "../src/lib/correlationClient.js";

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

let seed = 3232; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const cols = { Cu: [], Au: [], As: [] };
for (let i = 0; i < 2000; i++) { const z = rnd(); cols.Cu.push(10 + 100 * z + 20 * rnd()); cols.Au.push(0.01 + z * rnd()); cols.As.push(5 + 50 * rnd()); }

test("an object epoch: a tick after the first answer still has the earlier columns, and the object is never posted", async () => {
  posted.length = 0;
  const caches = { cols, lt: {}, pairs: new Map() }; // the dialog's epoch
  const client = createCorrelationClient({ makeWorker: fakeWorker });
  await client.compute({ epoch: caches, cols, symbols: ["Cu", "Au"], method: "spearman", cache: caches.pairs }).promise;
  const ticked = await client.compute({ epoch: caches, cols, symbols: ["Cu", "Au", "As"], method: "spearman", cache: caches.pairs }).promise;
  assert.deepEqual(ticked, correlationMatrix(cols, ["Cu", "Au", "As"], "spearman"));
  assert.deepEqual(posted.map((d) => Object.keys(d.cols).sort()), [["Au", "Cu"], ["As"]], "each column once");
  assert.ok(posted.every((d) => typeof d.epoch === "number"), "a number travels, not the caches");
  assert.equal(posted[0].epoch, posted[1].epoch);
  const next = { cols, lt: {}, pairs: new Map() }; // new rows: a new epoch, the columns sent again
  await client.compute({ epoch: next, cols, symbols: ["Cu", "As"], method: "spearman", cache: next.pairs }).promise;
  assert.notEqual(posted[2].epoch, posted[1].epoch);
  assert.deepEqual(Object.keys(posted[2].cols).sort(), ["As", "Cu"]);
});

test("below-detection pairs read on the flagged rows give the full scan's count", async () => {
  const { belowDetectionRows, belowDetectionPairs } = await import("../src/lib/correlation.js");
  let s = 7; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let t = 0; t < 20; t++) {
    const n = 500, ca = [], cb = [], la = new Uint8Array(n), lb = new Uint8Array(n);
    for (let i = 0; i < n; i++) { ca.push(r() < 0.1 ? null : r() < 0.05 ? NaN : r()); cb.push(r() < 0.1 ? null : r()); la[i] = r() < 0.2 ? 1 : 0; lb[i] = r() < (t % 3 ? 0.3 : 0) ? 1 : 0; }
    let full = 0;
    for (let i = 0; i < n; i++) if (ca[i] != null && cb[i] != null && Number.isFinite(ca[i]) && Number.isFinite(cb[i]) && (la[i] || lb[i])) full++;
    assert.equal(belowDetectionPairs(ca, cb, la, belowDetectionRows(la), belowDetectionRows(lb)), full);
  }
  assert.deepEqual(belowDetectionRows(new Uint8Array(4)), []);
  assert.deepEqual(belowDetectionRows(undefined), []);
});
