// TASKS.csv #3334 (review #3195, Galore Creek) — 'Plan a hole to here' from a score built on per-hole cards handed over RL 801 m: the middle of
// a hole with NO intercept 534 m away (holeIntervalPoints gave intercept holes no elevation and barren holes their mid-span), 10 m under the
// ground at the target. The intercepts' own elevation now, and none from a barren hole.
import test from "node:test";
import assert from "node:assert/strict";
import { holeIntervalPoints, targetElevation } from "../src/lib/evidenceSources.js";
import { computeBestIntercepts } from "../src/lib/geochem.js";
import { holeTotals } from "../src/lib/accumulation.js";

const vertical = (x, y, z, len) => [{ x, y, z, md: 0 }, { x, y, z: z - len, md: len }];
// H1 cuts 0.3 ppm Au from 200 to 260 m below a collar at RL 1,000 (RL 800 to 740); H2, 534 m away, is assayed 16-253 m with nothing above
const traces = new Map([["H1", vertical(0, 0, 1000, 400)], ["H2", vertical(534, 0, 1050, 300)]]);
const units = { Au: "ppm" };
const rows = [];
for (let d = 0; d < 400; d += 2) rows.push({ hole_id: "H1", from: d, to: d + 2, values: { Au: d >= 200 && d < 260 ? 1.2 : 0.05 } });
for (let d = 16; d < 253; d += 2) rows.push({ hole_id: "H2", from: d, to: d + 2, values: { Au: 0.02 } });
const opts = { cutoff: 0.3, computeBestIntercepts, holeTotals, how: "m" };
const grid = { dx: 10, dy: 10 };

test("a target near the intercept takes the intercept's elevation; a barren hole gives none", () => {
  const pts = holeIntervalPoints(rows, "Au", "ppm", units, traces, opts);
  const h1 = pts.find((p) => p.hole_id === "H1"), h2 = pts.find((p) => p.hole_id === "H2");
  assert.equal(h1.value, 60);
  assert.equal(h1.z, 770, "the middle of RL 800-740");
  assert.equal(h2.value, 0); assert.equal(h2.z, null);
  const t = targetElevation({ x: 5, y: 0 }, [{ pts, reach: 600 }], grid);
  assert.deepEqual([t.from, t.z], ["point", 770]);
});

test("a target only a barren hole reaches gets no elevation from it: the next card's, the Level's middle, or none (typed)", () => {
  const pts = holeIntervalPoints(rows, "Au", "ppm", units, traces, opts);
  const atH2 = { x: 534, y: 0 };
  // only H2 within the card's reach: before, its mid-span RL (1,050 - 134.5 = 915.5) was handed over
  assert.equal(targetElevation(atH2, [{ pts, reach: 100 }], grid), null);
  assert.deepEqual(targetElevation(atH2, [{ pts, reach: 100 }], grid, { zMin: 600, zMax: 700 }), { z: 650, from: "level" });
  const second = [{ x: 530, y: 0, z: 880, value: 2 }];
  assert.equal(targetElevation(atH2, [{ pts, reach: 100 }, { pts: second, reach: 100 }], grid).z, 880);
  // within the reach of both: the mean is of the intercept hole alone
  const both = targetElevation({ x: 300, y: 0 }, [{ pts, reach: 600 }], grid);
  assert.deepEqual([both.from, both.z, both.n], ["mean", 770, 1]);
});
