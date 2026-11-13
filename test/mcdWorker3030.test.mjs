// TASKS.csv #3030 (split from #1999) — the MCD anomaly score ran on the main thread, about 0.1 s per 1,000 samples (10^5 froze the window
// about 10 s). The values are packed into one Float64Array and the fit (mcdFromPacked) runs in a worker from MCD_WORKER_FROM samples
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mcdAnomalyScores, mcdPack, mcdFromPacked } from "../src/lib/mcd.js";
import { runMcdScores, MCD_WORKER_FROM } from "../src/lib/mcdClient.js";

let seed = 3;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const rows = Array.from({ length: 600 }, (_, i) => ({ values: { Cu: 20 + rnd() * 40 + (i % 97 === 0 ? 900 : 0), Zn: 50 + rnd() * 50, Pb: 10 + rnd() * 10, As: i === 5 ? null : 3 + rnd() * 4 } }));
const S = ["Cu", "Zn", "Pb", "As"];

test("packed values give the same scores as the rows", () => {
  const a = mcdAnomalyScores(rows, S), packed = mcdPack(rows, S);
  assert.equal(packed.length, rows.length * 4);
  assert.ok(!(packed[5 * 4 + 3] > 0), "no value: not a positive number, so the sample is left out (as Number(null) was before)");
  const b = mcdFromPacked(packed, rows.length, 4);
  assert.deepEqual(b, a);
  assert.equal(a.scores[5], null);
  assert.ok(a.flagged > 0);
});

// a fake worker: posts the answer back asynchronously, as a real one would (the transferred buffer arrives intact)
const fakeWorker = (log) => () => {
  const w = { terminated: false, postMessage(d, transfer) { log.push({ n: d.n, D: d.D, transferred: (transfer || []).length }); setTimeout(() => { if (!w.terminated) w.onmessage({ data: { id: d.id, result: mcdFromPacked(d.packed, d.n, d.D, d.opts) } }); }, 5); }, terminate() { w.terminated = true; } };
  return w;
};

test("from workerFrom samples the fit runs in the worker; the same answer", async () => {
  const log = [];
  const r = await runMcdScores(rows, S, { workerFrom: 100, makeWorker: fakeWorker(log) }).promise;
  assert.deepEqual(log, [{ n: 600, D: 4, transferred: 1 }]);
  assert.deepEqual(r, mcdAnomalyScores(rows, S));
});

test("below the threshold, without a worker, or with fewer than three elements: on this thread", async () => {
  const log = [];
  const r = await runMcdScores(rows, S, { workerFrom: 10000, makeWorker: fakeWorker(log), pause: (f) => f() }).promise;
  assert.equal(log.length, 0); assert.equal(r.used, 599);
  const r2 = await runMcdScores(rows, S, { workerFrom: 1, makeWorker: () => { throw new Error("no workers"); }, pause: (f) => f() }).promise;
  assert.equal(r2.used, 599);
  await assert.rejects(runMcdScores(rows, ["Cu", "Zn"], { workerFrom: 1, makeWorker: fakeWorker(log), pause: (f) => f() }).promise, /at least three elements/);
  assert.equal(log.length, 0);
  assert.equal(MCD_WORKER_FROM, 5000);
});

test("cancel stops the worker and drops the answer", async () => {
  const log = [];
  let w = null;
  const job = runMcdScores(rows, S, { workerFrom: 1, makeWorker: () => (w = fakeWorker(log)()) });
  let settled = false;
  job.promise.then(() => { settled = true; }, () => { settled = true; });
  job.cancel();
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(w.terminated, true); assert.equal(settled, false);
});

test("wiring: the panel runs through the client and drops a run on close", () => {
  const s = readFileSync(new URL("../src/components/McdAnomalyPanel.jsx", import.meta.url), "utf8");
  assert.match(s, /const j = runMcdScores\(pool, chosen\);/);
  assert.match(s, /useEffect\(\(\) => \(\) => job\.current\?\.cancel\(\), \[\]\)/);
  assert.doesNotMatch(s, /mcdAnomalyScores\(pool/);
});
