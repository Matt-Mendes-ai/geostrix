// TASKS.csv #3009 (WA iron review) — the variogram's pair loop and the direction table off the main thread, with Cancel
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { makeVariogramClient } from "../src/lib/variogramClient.js";
import { experimentalVariogram, directionRow, DIRECTION_TABLE } from "../src/lib/variogram.js";
import { unpackPoints } from "../src/lib/pointColumns.js";

let seed = 9; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pts = []; for (let h = 0; h < 30; h++) for (let k = 0; k < 15; k++) pts.push({ x: (h % 6) * 25, y: Math.floor(h / 6) * 25, z: -k * 2, value: 10 + 5 * Math.sin(h) + rnd(), hole_id: `H${h}` });
const base = { lagDistance: 10, nLags: 8, lagTolerance: 0.5, holeMode: "all" };

// a fake Worker that runs the real worker's logic (variogram.worker.js does exactly this) on the posted data
function fakeWorker(posted) {
  let kept = null, keptKey = null;
  return class { postMessage(m) { posted.push(m); setTimeout(() => {
    if (m.packed) { kept = unpackPoints(structuredClone(m.packed)); keptKey = m.key; }
    const result = keptKey === m.key ? (m.kind === "dir" ? directionRow(kept, m.opts, m.dir, m.model) : experimentalVariogram(kept, m.opts)) : null;
    this.onmessage?.({ data: result ? { id: m.id, result } : { id: m.id, failed: "the composites were not sent" } });
  }, 0); } terminate() {} };
}

test("the worker's answer equals the main-thread one; the composites go once, the direction rows name them", async () => {
  const posted = []; globalThis.Worker = fakeWorker(posted);
  try {
    const c = makeVariogramClient();
    const vg = await c.variogram(pts, base);
    assert.deepEqual(vg, experimentalVariogram(pts, base));
    const row = await c.directionRow(pts, base, DIRECTION_TABLE[0], "spherical");
    assert.deepEqual(row, directionRow(pts, base, DIRECTION_TABLE[0], "spherical"));
    assert.ok(posted[0].packed && !posted[1].packed && posted[1].key === posted[0].key);
    c.stop();
  } finally { delete globalThis.Worker; }
});

test("Cancel rejects what is running with .cancelled; the next request sends the composites again", async () => {
  const posted = []; globalThis.Worker = class { postMessage(m) { posted.push(m); } terminate() {} }; // never answers
  try {
    const c = makeVariogramClient();
    const p = c.variogram(pts, base);
    c.cancel();
    await assert.rejects(p, (e) => e.cancelled === true);
    c.variogram(pts, base).catch(() => {});
    assert.ok(posted[1].packed, "after a cancel the new worker gets the composites");
    c.stop();
  } finally { delete globalThis.Worker; }
});

test("no Worker: the same answer on this thread", async () => {
  const c = makeVariogramClient();
  assert.deepEqual(await c.variogram(pts, base), experimentalVariogram(pts, base));
});

test("wired in the dialog: the worker for the variogram and the direction table, Cancel", () => {
  const v = readFileSync(new URL("../src/components/VariogramModal.jsx", import.meta.url), "utf8");
  assert.match(v, /const vg = await vgClient\.current\.variogram\(vgPoints, \{/);
  assert.match(v, /vgClient\.current\.directionRow\(run\.points, run\.base, DIRECTION_TABLE\[i\], run\.model\)\.then\(/);
  assert.match(v, /onClick=\{\(\) => \{ vgClient\.current\.cancel\(\); setRunning\(false\); \}\}/);
  assert.match(readFileSync(new URL("../src/lib/variogram.worker.js", import.meta.url), "utf8"), /kind === "dir" \? directionRow\(kept, opts, dir, model\) : experimentalVariogram\(kept, opts\)/);
});
