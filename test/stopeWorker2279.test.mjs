// TASKS.csv #2279 (review #2174, WA gold) — Stope outlines run in a worker with level progress and a cancel; a level interval under the
// block height is asked before the run
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stopeOutlines } from "../src/lib/stopeOutlines.js";
import { blockColumnsOf } from "../src/lib/stopeOutlinesClient.js";
import { pitCeiling, ceilingLookup } from "../src/lib/pitCeiling.js";

// a 10 m model: a 30 x 30 m high-grade column of blocks from 0 to 100 m
const cells = [];
for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) for (let k = 0; k < 10; k++) cells.push({ x: 5 + 10 * i, y: 5 + 10 * j, z: 5 + 10 * k, dx: 10, dy: 10, dz: 10, value: i >= 2 && i <= 4 && j >= 2 && j <= 4 ? 5 : 0.1 });
const model = { cells };
const opts = { cutoff: 1, levelH: 20, minWidth: 10, skin: 0, density: 2.8 };

test("onLevel counts the levels, one call per level", () => {
  const calls = [];
  const r = stopeOutlines(model, { ...opts, onLevel: (k, n) => calls.push([k, n]) });
  assert.deepEqual(calls, [[1, 5], [2, 5], [3, 5], [4, 5], [5, 5]]);
  assert.equal(r.levels.length, 5);
});

test("the worker's input, rebuilt from flat arrays, gives the same result as a direct call", async () => {
  const cols = blockColumnsOf({ cells: cells.map((c, i) => (i === 0 ? { ...c, coverage: 0.5 } : c)) });
  assert.ok(cols.value instanceof Float64Array && cols.value.length === cells.length);
  assert.equal(cols.coverage[0], 0.5); assert.ok(Number.isNaN(cols.coverage[1]));
  // run the worker module's handler in Node with a stand-in `self`
  const posted = [];
  globalThis.self = { postMessage: (m) => posted.push(m) };
  await import("../src/lib/stopeOutlines.worker.js");
  globalThis.self.onmessage({ data: { columns: blockColumnsOf(model), opts, ceiling: null } });
  const res = posted.find((m) => m.result)?.result;
  assert.ok(posted.some((m) => m.level === 5 && m.levels === 5), "the last level is always reported");
  const direct = stopeOutlines(model, opts);
  assert.equal(res.totals.stopes, direct.totals.stopes);
  assert.equal(Math.round(res.totals.tonnes), Math.round(direct.totals.tonnes));
  // with a pit ceiling sent as its grid: the same as the lookup given directly
  const frame = { x0: 5, y0: 5, dx: 10, dy: 10, nx: 8, ny: 8 };
  const P = Float64Array.from([0, 0, 60, 80, 0, 60, 80, 80, 60, 0, 80, 60]), I = Uint32Array.from([0, 1, 2, 0, 2, 3]);
  const values = pitCeiling(P, I, frame);
  posted.length = 0;
  globalThis.self.onmessage({ data: { columns: blockColumnsOf(model), opts: { ...opts, pillar: 10 }, ceiling: { values, frame } } });
  const withPit = posted.find((m) => m.result).result, directPit = stopeOutlines(model, { ...opts, pillar: 10, ceilingAt: ceilingLookup(values, frame) });
  assert.equal(withPit.levels.filter((l) => l.stopes.length).length, directPit.levels.filter((l) => l.stopes.length).length);
  assert.ok(withPit.levels.filter((l) => l.stopes.length).length < 5, "the pit at 60 m shuts the upper levels");
  delete globalThis.self;
});

test("the pane runs it through the worker, shows the level and a cancel, and asks about thin levels first", () => {
  const p = readFileSync(new URL("../src/components/StopesPane.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(p, /\bstopeOutlines\(model/);
  assert.match(p, /runStopeOutlinesAsync\(model, \{/);
  assert.match(p, /Outlining level \{k\} of \{n\}: cancel/);
  assert.match(p, /v\("levelH"\) < blockH - 1e-9 && !window\.confirm\(/);
});
