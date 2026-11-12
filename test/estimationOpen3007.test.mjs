// TASKS.csv #3007 (WA iron review) — the Estimation dialog's freeze: the traces go to the reach worker once (not copied on every cell /
// radius change), and the sampled share and the never-assayed holes come from one coverage pass
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { makeReachClient } from "../src/lib/blockReachClient.js";
import { coverageSummary, sampledShare, unassayedHoles } from "../src/lib/unsampledFill.js";

test("the reach client sends a traces array once, then names it by key; a new array is sent again", async () => {
  const posted = [];
  globalThis.Worker = class { constructor() { setTimeout(() => {}, 0); } postMessage(m) { posted.push(m); setTimeout(() => this.onmessage?.({ data: { id: m.id, result: { reach: 1 } } }), 0); } terminate() {} };
  try {
    const c = makeReachClient(), traces = [[{ x: 0, y: 0, z: 0 }]], other = [[{ x: 1, y: 1, z: 1 }]];
    await c.request({ traces, bounds: {} }).promise;
    await c.request({ traces, bounds: {}, cell: 5 }).promise;
    await c.request({ traces: other, bounds: {} }).promise;
    assert.equal(posted[0].args.traces, traces); assert.ok(posted[0].args.tracesKey > 0);
    assert.equal(posted[1].args.traces, null); assert.equal(posted[1].args.tracesKey, posted[0].args.tracesKey);
    assert.equal(posted[2].args.traces, other); assert.notEqual(posted[2].args.tracesKey, posted[0].args.tracesKey);
    c.stop();
  } finally { delete globalThis.Worker; }
});

test("the worker keeps the traces it was sent", () => {
  const w = readFileSync(new URL("../src/lib/blockReach.worker.js", import.meta.url), "utf8");
  assert.match(w, /if \(args\.traces\) \{ keptTraces = args\.traces; keptKey = args\.tracesKey; \}/);
  assert.match(w, /else if \(keptKey === args\.tracesKey\) a = \{ \.\.\.args, traces: keptTraces \};/);
});

test("coverageSummary = sampledShare + unassayedHoles, in one pass; the hook uses it", () => {
  const collars = ["A", "B", "C"].map((h) => ({ hole_id: h, max_depth: 20 }));
  const assays = [{ hole_id: "A", from: 0, to: 10, values: { Fe: 50 } }, { hole_id: "B", from: 0, to: 20, values: { Fe: 40 } }];
  const u = { Fe: "%" }, c = coverageSummary(assays, collars, "Fe", "%", u);
  assert.deepEqual(c.info, sampledShare(assays, collars, "Fe", "%", u));
  assert.deepEqual(c.unassayed, unassayedHoles(assays, collars, "Fe", "%", u));
  assert.deepEqual(c.unassayed.map((h) => h.hole_id), ["C"]);
  assert.match(readFileSync(new URL("../src/components/UnsampledChoice.jsx", import.meta.url), "utf8"), /const cov = useMemo\(\(\) => coverageSummary\(/);
});
