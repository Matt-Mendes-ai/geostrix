// TASKS.csv #3111 — the Variogram tool's first Compute for an element / length / domain froze the window about 1 s on 147,000 samples
// (compositing and placing in one task: 842 ms on WA iron). Both now run in slices of whole holes (lib/compositeSliced.js); the Estimation
// run places its points the same way (#3105's follow-up).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { samplePointsFromIntervals } from "../src/lib/estimation.js";
import { samplePointsSliced } from "../src/lib/compositeSliced.js";
import { makeRunCache } from "../src/lib/runCache.js";
import { desurveyHole } from "../src/lib/desurvey.js";

let seed = 3;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const collars = [], survey = [], intervals = [];
for (let h = 0; h < 60; h++) {
  const id = `H${String(h).padStart(2, "0")}`;
  if (h !== 7) collars.push({ hole_id: id, x: h * 40, y: (h % 7) * 30, z: 300, depth: 120 }); // H07 has no collar: dropped
  survey.push({ hole_id: id, depth: 0, dip: -60 - rnd() * 25, azimuth: rnd() * 360 }, { hole_id: id, depth: 120, dip: -60 - rnd() * 25, azimuth: rnd() * 360 });
  for (let d = 0; d < 130; d += 2) intervals.push({ hole_id: id, from: d, to: d + 2, avgGrade: rnd() < 0.03 ? -1 : rnd() < 0.03 ? null : rnd() * 10, length: 2, coverage: 1 }); // past 120 m: beyond the trace
}

test("placing in slices of whole holes gives exactly samplePointsFromIntervals' points and counts", async () => {
  const one = samplePointsFromIntervals(intervals, collars, survey, desurveyHole, "minimum_curvature");
  let pieces = 0;
  const sliced = await samplePointsSliced(intervals, collars, survey, desurveyHole, "minimum_curvature", { rowsPerSlice: 300, yieldFn: async () => { pieces++; } });
  assert.deepEqual(sliced, one);
  assert.ok(one.dropped > 0 && one.clamped > 0 && one.beyondTrace > 0, JSON.stringify({ d: one.dropped, c: one.clamped, b: one.beyondTrace }));
  assert.ok(pieces >= 5, String(pieces));
  // a slice never splits a hole: cut points fall where the hole changes
  const cuts = []; await samplePointsSliced(intervals, collars, survey, desurveyHole, "minimum_curvature", { rowsPerSlice: 100, yieldFn: async () => { cuts.push(1); } });
  assert.ok(cuts.length > 0);
  const ac = new AbortController();
  await assert.rejects(samplePointsSliced(intervals, collars, survey, desurveyHole, "minimum_curvature", { rowsPerSlice: 300, signal: ac.signal, yieldFn: async () => ac.abort() }), (e) => e.cancelled === true);
  assert.deepEqual(await samplePointsSliced([], collars, survey, desurveyHole, "minimum_curvature"), { points: [], dropped: 0, clamped: 0, beyondTrace: 0 });
});

test("makeRunCache.getAsync: the same rule as get, for a compute that awaits", async () => {
  const c = makeRunCache(), rows = [1, 2];
  let calls = 0;
  const f = async () => { calls++; return { n: calls }; };
  assert.deepEqual(await c.getAsync([rows, "Au"], f), { value: { n: 1 }, hit: false });
  assert.deepEqual(await c.getAsync([rows, "Au"], f), { value: { n: 1 }, hit: true });
  assert.equal((await c.getAsync([rows, "Cu"], f)).hit, false);
  assert.equal(calls, 2);
});

test("wiring: the Variogram tool and the Estimation run composite and place in slices", () => {
  const v = readFileSync(new URL("../src/components/VariogramModal.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(v, /const comp = \(await compCache\.current\.getAsync\(\[srcAssays,/);
  assert.match(v, /const intervals = await compositeDownholeSliced\(filled\.assays, symbol, unit, elementUnits, \{/);
  assert.match(v, /= await samplePointsSliced\(intervals, collars, survey, desurveyHole, desurveyMethod\);/);
  assert.ok(!/import \{ samplePointsFromIntervals \}/.test(v));
  const e = readFileSync(new URL("../src/components/GradeEstimationModal.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(e, /let \{ points, dropped, clamped, beyondTrace \} = await samplePointsSliced\(intervals, collars, survey, desurveyHole, desurveyMethod\);/);
  assert.match(e, /let mp = \(await samplePointsSliced\(iv, collars, survey, desurveyHole, desurveyMethod, \{ signal: ac\.signal \}\)\)\.points;/);
});
