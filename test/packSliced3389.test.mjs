// TASKS.csv #3389 / #3403 (side session notes, from #3105 / #3111) — packing 147,601 points for a worker was one 0.35-0.4 s task, in the Estimation
// run and in the Variogram's first Compute, and the Variogram's two lag suggestions (a grid search over every point each) ran on the main thread too.
// Packed in slices; the suggestions in the Variogram worker; requests still reach the worker in the order they were made.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { packPoints, packPointsSliced, unpackPoints } from "../src/lib/pointColumns.js";

const fresh = (n = 3000) => Array.from({ length: n }, (_, i) => ({ hole_id: `H${i % 40}`, x: i * 1.5, y: i % 77, z: 100 - i * 0.01, value: i % 13 === 0 ? null : i * 0.3, length: 2, domain: i % 5 === 0 ? undefined : i % 5 === 1 ? null : "B", tag: i % 2 ? "a" : 7 }));

test("packPointsSliced equals packPoints (numbers, null, undefined, strings, mixed), with a pause between slices", async () => {
  const a = fresh(), b = fresh();
  const want = packPoints(a);
  let pauses = 0;
  const got = await packPointsSliced(b, { budgetMs: 0, sliceRows: 500, pause: async () => { pauses++; } });
  assert.ok(pauses > 20, String(pauses));
  assert.deepEqual(Object.keys(got.num), Object.keys(want.num));
  for (const k of Object.keys(want.num)) assert.deepEqual([...got.num[k]].map((v) => (Number.isNaN(v) ? "nan" : v)), [...want.num[k]].map((v) => (Number.isNaN(v) ? "nan" : v)), k);
  assert.deepEqual(got.nulls, want.nulls); assert.deepEqual(got.other, want.other);
  // the string columns go as a table and codes (the structured clone of 147,601 strings was most of the hand-off), and the mixed one stays a list
  assert.deepEqual(Object.keys(got.strs).sort(), ["domain", "hole_id"]); assert.deepEqual(Object.keys(got.other), ["tag"]);
  assert.equal(got.strs.hole_id.table.length, 40); assert.ok(got.strs.hole_id.codes instanceof Int32Array);
  assert.deepEqual(got.strs, want.strs);
  assert.deepEqual([...got.strs.domain.codes].filter((c) => c < 0).length, fresh().filter((p) => p.domain == null).length, "absent (-1) and null (-2) kept apart");
  assert.deepEqual(unpackPoints(got), unpackPoints(want), "the worker rebuilds the same objects");
  assert.equal(await packPointsSliced(b), got, "kept per array: the second asker gets the same packing");
  assert.equal(packPoints(b), got, "and the synchronous packer reuses it");
});

test("the unsampled drill points ({ x, y, z } objects) round-trip as columns", async () => {
  const uns = Array.from({ length: 5000 }, (_, i) => ({ x: 1000 + i * 0.5, y: 2000 - i, z: 300 - i * 0.1 }));
  const got = unpackPoints(await packPointsSliced(uns)), want = unpackPoints(packPoints(uns.map((p) => ({ ...p }))));
  assert.deepEqual(got, uns); assert.deepEqual(want, uns);
  assert.deepEqual(unpackPoints(await packPointsSliced([])), []);
  // strings with null / absent / a missing field round-trip too
  const mixed = [{ a: "x" }, { a: null }, {}, { a: "y", b: 1 }, { a: "x", b: null }];
  assert.deepEqual(unpackPoints(await packPointsSliced(mixed.map((p) => ({ ...p })))), mixed);
  assert.deepEqual(unpackPoints(packPoints(mixed.map((p) => ({ ...p })))), mixed);
});

test("an aborted signal rejects with .cancelled, between slices", async () => {
  const ac = new AbortController();
  await assert.rejects(packPointsSliced(fresh(4000), { budgetMs: 0, sliceRows: 300, signal: ac.signal, pause: async () => { ac.abort(); } }), (e) => e.cancelled === true);
  const ac2 = new AbortController(); ac2.abort();
  await assert.rejects(packPointsSliced(fresh(10), { signal: ac2.signal }), (e) => e.cancelled === true);
  assert.deepEqual((await packPointsSliced([])).n, 0);
});

test("variogramClient: points go once, in order, packed in slices; suggest rides the same path; cancel posts nothing more", async () => {
  const posts = [];
  class FakeWorker {
    constructor() { this.onmessage = null; this.onerror = null; }
    postMessage(m) { posts.push({ ...m, hasPacked: !!m.packed }); setTimeout(() => this.onmessage?.({ data: { id: m.id, result: { kind: m.kind } } }), 0); }
    terminate() { this.dead = true; }
  }
  globalThis.Worker = FakeWorker;
  try {
    const { makeVariogramClient } = await import("../src/lib/variogramClient.js");
    const c = makeVariogramClient(), pts = fresh(2000);
    const r = await Promise.all([c.suggest(pts, { between: true, lag: true }), c.variogram(pts, { lag: 5 }), c.suggest(pts, { between: false, lag: true })]);
    assert.deepEqual(r.map((x) => x.kind), ["suggest", "vg", "suggest"]);
    assert.deepEqual(posts.map((p) => [p.kind, p.hasPacked]), [["suggest", true], ["vg", false], ["suggest", false]], "the first carries the columns, in request order");
    assert.deepEqual(posts[0].opts, { between: true, lag: true });
    // a cancel before the points are packed: nothing is posted for it, and it rejects with .cancelled
    posts.length = 0;
    const c2 = makeVariogramClient(), p2 = c2.suggest(fresh(3000), { lag: true });
    c2.cancel();
    await assert.rejects(p2, (e) => e.cancelled === true);
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(posts.length, 0);
  } finally { delete globalThis.Worker; }
});

test("variogramClient without a Worker: suggest runs here and equals the functions", async () => {
  delete globalThis.Worker;
  const { makeVariogramClient } = await import("../src/lib/variogramClient.js");
  const { suggestBetweenHoleLag, suggestLagDistance } = await import("../src/lib/variogram.js");
  const pts = fresh(1500).map((p, i) => ({ ...p, hole_id: `H${i % 25}`, z: p.z + (i % 25) }));
  const got = await makeVariogramClient().suggest(pts, { between: true, lag: true });
  assert.equal(got.between, suggestBetweenHoleLag(pts)); assert.equal(got.lag, suggestLagDistance(pts));
  assert.deepEqual(await makeVariogramClient().suggest(pts, {}), { between: null, lag: null });
});

test("wiring: the estimation hand-off, the worker's suggest, the dialog awaiting it", () => {
  const ec = readFileSync(new URL("../src/lib/estimationClient.js", import.meta.url), "utf8");
  assert.match(ec, /const packed = await packPointsSliced\(points, \{ signal \}\);/);
  assert.match(ec, /if \(opts\.unsampledPoints\?\.length\) \{ packedOpts\.unsampledPoints = await packPointsSliced\(opts\.unsampledPoints, \{ signal \}\); delete send\.unsampledPoints; \}/);
  assert.match(ec, /if \(!settled\) worker\.postMessage\(\{ kind, packed, opts: send, packedOpts \}\);/);
  const ew = readFileSync(new URL("../src/lib/estimation.worker.js", import.meta.url), "utf8");
  assert.match(ew, /if \(po\?\.unsampledPoints\) opts = \{ \.\.\.opts, unsampledPoints: unpackPoints\(po\.unsampledPoints\) \};/);
  assert.match(ew, /if \(po\?\.memberUnsampled\) opts = \{ \.\.\.opts, members: \{ \.\.\.opts\.members, unsampled: po\.memberUnsampled\.map/);
  const w = readFileSync(new URL("../src/lib/variogram.worker.js", import.meta.url), "utf8");
  assert.match(w, /kind === "suggest" \? \{ between: opts\?\.between \? suggestBetweenHoleLag\(kept\) : null, lag: opts\?\.lag \? suggestLagDistance\(kept\) : null \}/);
  const m = readFileSync(new URL("../src/components/VariogramModal.jsx", import.meta.url), "utf8");
  assert.match(m, /const sug = await vgClient\.current\.suggest\(tPoints, \{ between: holeMode !== "downhole", lag: true \}\);/);
  assert.match(m, /const between = holeMode === "downhole" \? null : sug\.between;/);
  assert.match(m, /: between != null \? between \/ 4 : sug\.lag;/);
  assert.ok(!/suggestBetweenHoleLag\(tPoints\)|suggestLagDistance\(tPoints\)/.test(m));
});
