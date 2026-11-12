// TASKS.csv #2994 (review #2876, WA iron) — 'blocks whose nearest drilling was never sampled' counted assayed holes that were only unchecked:
// with 'Samples from: the checked holes' the estimate took every collar's trace but only the run's samples, so 1,423 of the 1,666 flagged
// blocks sat beside assayed holes and the pit reports carried it as '13 to 18 % of the ore'. #3006 (side 3) builds the flag from the run's
// holes; this checks it end to end: the unsampled-drilling points, and the pit share that reads the blocks' flag.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sampledByHole, unsampledDrillPoints } from "../src/lib/insideSampling.js";
import { resolvedSegments } from "../src/lib/geochem.js";
import { desurveyHole } from "../src/lib/desurvey.js";
import { runPitShell } from "../src/lib/pitShell.js";

const collars = ["A", "B", "C", "D"].map((h, i) => ({ hole_id: h, x: i * 50, y: 0, z: 440, azimuth: 0, dip: 90, length: 40 }));
const assays = collars.flatMap((c) => [0, 10, 20, 30].map((f) => ({ hole_id: c.hole_id, from: f, to: f + 10, values: { Fe: 60 } })));
const checked = new Set(["A", "B"]), runAssays = assays.filter((a) => checked.has(a.hole_id)), units = { Fe: "%" };
const traceOf = (c) => ({ hole_id: c.hole_id, pts: desurveyHole(c, [], "minimum curvature") });

test("#2994 the run's holes only: an unchecked, assayed hole's drilling is not 'never sampled'", () => {
  const sampled = sampledByHole(resolvedSegments(runAssays, "Fe", "%", units));
  const allCollars = unsampledDrillPoints(collars.map(traceOf), sampled, 2);
  const runCollars = unsampledDrillPoints(collars.filter((c) => checked.has(c.hole_id)).map(traceOf), sampled, 2);
  assert.equal(allCollars.length, 40, "the bug: C and D's 40 m each, as points every 2 m, read as unsampled");
  assert.equal(runCollars.length, 0, "with the run's holes (#3006): none");
});

test("#2994 downstream: the pit's 'never sampled' share is the blocks' own flag, so it follows the estimate", () => {
  const cells = (flagged) => { const out = []; for (let i = 0; i < 8; i++) for (let k = 0; k < 10; k++) out.push({ x: i * 25 + 12.5, y: 12.5, z: 400 + k * 4 + 2, dx: 25, dy: 25, dz: 4, value: 60, ...(flagged && i >= 4 ? { nearUnsampled: true } : {}) }); return out; };
  const inp = { unit: "%", element: "Fe", price: 161.29, priceUnit: "t", recovery: 100, miningCost: 3, processingCost: 35, density: 2.9, slopeDeg: 45 };
  const bug = runPitShell({ ...inp, cells: cells(true) }, { groundAt: () => 440 }), fixed = runPitShell({ ...inp, cells: cells(false) }, { groundAt: () => 440 });
  assert.ok(bug.oreNearUnsampledShare > 0.4, `flagged blocks carried into the pit: ${bug.oreNearUnsampledShare}`);
  assert.equal(fixed.oreNearUnsampledShare, 0, "unflagged blocks: no share");
  // Pit shell, Nested pits and Pit design all read that share, none recomputes it from collars
  for (const f of ["PitShellPane.jsx", "NestedPitsPane.jsx", "PitDesignPane.jsx"]) {
    const s = readFileSync(new URL(`../src/components/${f}`, import.meta.url), "utf8");
    assert.ok(/oreNearUnsampledShare/.test(s) && !/unsampledDrillPoints/.test(s), f);
  }
});
