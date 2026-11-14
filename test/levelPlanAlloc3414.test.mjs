// TASKS.csv #3414 (#3298's follow-up) — the Level plan's trace polylines made as [x, y] pairs directly: the same pairs as before.
import test from "node:test";
import assert from "node:assert/strict";
import { tracePolylines, pointAtMd } from "../src/lib/levelPlan.js";

// the function as it was
const before = (trace, runs) => runs.map(([a, b]) => { const pts = [pointAtMd(trace, a)]; for (const p of trace) if (p.md > a && p.md < b) pts.push(p); pts.push(pointAtMd(trace, b)); return pts.map((p) => [p.x, p.y]); });

test("the same pairs as before on random traces and runs (ends before, inside and past the trace)", () => {
  let seed = 3414; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 300; k++) {
    const n = 2 + Math.floor(rnd() * 12), trace = [];
    let md = 0, x = rnd() * 100, y = rnd() * 100, z = 400;
    for (let i = 0; i < n; i++) { trace.push({ md, x, y, z }); md += 1 + rnd() * 30; x += rnd() * 10 - 5; y += rnd() * 10 - 5; z -= rnd() * 20; }
    const runs = Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => { const a = rnd() * md * 1.2 - 5, b = a + rnd() * 60; return [a, b]; });
    assert.deepEqual(tracePolylines(trace, runs), before(trace, runs));
  }
});

test("an empty trace gives empty polylines (it threw before)", () => {
  assert.deepEqual(tracePolylines([], [[0, 10]]), [[]]);
});
