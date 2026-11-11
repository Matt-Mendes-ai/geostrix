// TASKS.csv #2547 — estimation froze the window 2.4-4.7 s after the worker answered. The checks on the main thread used string keys for every
// block, rebuilt the estimate / NN join for the check and each swath, and scanned every block for each high composite without a block. Same
// results, cheaper.
import test from "node:test";
import assert from "node:assert/strict";
import { estimateCheck, swath } from "../src/lib/estimateCheck.js";
import { topCompositesWithoutBlocks } from "../src/lib/shellSupport.js";

// a lattice of 10 m blocks, 60 x 60 x 50 = 180,000, origin off a round number; NN fills every other block
const cells = [], nn = [];
for (let i = 0; i < 60; i++) for (let j = 0; j < 60; j++) for (let k = 0; k < 50; k++) {
  const c = { x: 300005.3 + i * 10, y: 6200005.3 + j * 10, z: -245 + k * 10, dx: 10, dy: 10, dz: 10, value: (i + j + k) % 7 };
  cells.push(c); if ((i + j + k) % 2 === 0) nn.push({ ...c, value: c.value + 1 });
}
const points = Array.from({ length: 2000 }, (_, n) => ({ x: 300000 + (n % 60) * 10, y: 6200000 + Math.floor(n / 60) * 10, z: 0, value: n % 13, length: 2, hole_id: `H${n % 50}` }));

test("the check and the swaths agree with a plain string-key join", () => {
  const key = (c) => `${Math.round(c.x * 1000)},${Math.round(c.y * 1000)},${Math.round(c.z * 1000)}`;
  const nnBy = new Map(nn.map((c) => [key(c), c.value]));
  let n = 0, se = 0, sn = 0; for (const c of cells) { const v = nnBy.get(key(c)); if (v !== undefined) { n++; se += c.value; sn += v; } }
  const chk = estimateCheck(cells, nn, points);
  assert.equal(chk.estimate.n, n); assert.ok(Math.abs(chk.estimate.mean - se / n) < 1e-9); assert.ok(Math.abs(chk.nn.mean - sn / n) < 1e-9);
  const sw = swath(cells, nn, points, "z");
  assert.equal(sw.reduce((a, b) => a + b.blocks, 0), n);
  // blocks off any lattice (rotated, irregular): the string key still joins them
  const odd = [{ x: 1.23, y: 4.56, z: 7.89, dx: 3, dy: 3, dz: 3, value: 2 }, { x: 2.0, y: 4.56, z: 7.89, dx: 3, dy: 3, dz: 3, value: 4 }];
  assert.equal(estimateCheck(odd, odd.map((c) => ({ ...c, value: 1 })), []).estimate.n, 2);
});

test("check + three swaths on 180,000 blocks: fast", () => {
  const t0 = performance.now();
  estimateCheck(cells, nn, points); swath(cells, nn, points, "x"); swath(cells, nn, points, "y"); swath(cells, nn, points, "z");
  const ms = performance.now() - t0;
  assert.ok(ms < 1500, `${ms.toFixed(0)} ms`);
  console.log(`check + 3 swaths: ${ms.toFixed(0)} ms`);
});

test("high composites far from every block: the true nearest for the three the message names, not a full scan per composite", () => {
  // composites 300-400 m above the block tops: every one fails the reach test
  const far = Array.from({ length: 1000 }, (_, n) => ({ x: 300100 + (n % 30) * 5, y: 6200100 + Math.floor(n / 30) * 5, z: 550 + (n % 3) * 50, value: 10 + n, hole_id: `F${n}` }));
  const t0 = performance.now();
  const r = topCompositesWithoutBlocks(far, cells, 10, { share: 1 });
  const ms = performance.now() - t0;
  assert.equal(r.unsupported.length, 1000);
  // the three the message names carry the true nearest (exact against a brute force); the rest are not scanned
  assert.equal(r.unsupported.filter((u) => u.nearestM != null).length, 3);
  for (const u of r.unsupported.slice(0, 3)) {
    const c = far.find((f) => f.value === u.value);
    let brute = Infinity; for (const b of cells) { const d = Math.hypot(b.x - c.x, b.y - c.y, b.z - c.z); if (d < brute) brute = d; }
    assert.ok(Math.abs(brute - u.nearestM) < 1e-9, `${brute} vs ${u.nearestM}`);
  }
  assert.ok(ms < 1000, `${ms.toFixed(0)} ms`);
  console.log(`1,000 failed composites: ${ms.toFixed(0)} ms`);
});
