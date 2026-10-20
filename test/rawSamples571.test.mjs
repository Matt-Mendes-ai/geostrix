// TASKS.csv #571 — raw (non-composited) estimation samples: duplicates / overlaps resolved, nothing past the trace.
import test from "node:test";
import assert from "node:assert/strict";
import { rawSampleIntervals } from "../src/lib/geochem.js";
import { samplePointsFromIntervals } from "../src/lib/estimation.js";
import { desurveyHole } from "../src/lib/desurvey.js";

const U = { Au: "ppm" };
const row = (from, to, Au) => ({ hole_id: "H1", from, to, values: { Au } });

test("#571 an exact double import is one sample, not two", () => {
  const { intervals, stats } = rawSampleIntervals([row(0, 1, 5), row(0, 1, 5), row(1, 2, 1)], "Au", "ppm", U);
  assert.equal(intervals.length, 2);
  assert.equal(stats.duplicatesSkipped, 1);
});

test("#571 a re-assay over its parent interval resolves to segments, not two co-located samples", () => {
  // parent 0-2 m @ 4, re-assay of 0-1 m @ 8
  const { intervals, stats } = rawSampleIntervals([row(0, 2, 4), row(0, 1, 8)], "Au", "ppm", U);
  assert.deepEqual(intervals.map((i) => [i.from, i.to, i.avgGrade, !!i.conflict]), [[0, 1, 6, true], [1, 2, 4, false]]);
  assert.equal(stats.overlappingRows, 2);
});

test("#571 cap applies per segment; negative lab codes are not assayed", () => {
  const { intervals, stats } = rawSampleIntervals([row(0, 1, 50), row(1, 2, -0.005)], "Au", "ppm", U, { capValue: 20 });
  assert.deepEqual(intervals.map((i) => i.avgGrade), [20]);
  assert.equal(stats.negativeValues, 1);
});

test("#571 a sample deeper than the hole's trace is dropped and counted, not stacked at the bottom", () => {
  const collars = [{ hole_id: "H1", x: 0, y: 0, z: 100, azimuth: 0, dip: 90, length: 50 }]; // internal: positive = down
  const ivs = [{ hole_id: "H1", from: 10, to: 12, avgGrade: 1 }, { hole_id: "H1", from: 60, to: 62, avgGrade: 9 }];
  const r = samplePointsFromIntervals(ivs, collars, [], desurveyHole);
  assert.equal(r.points.length, 1);
  assert.equal(r.beyondTrace, 1);
  assert.equal(r.dropped, 1);
});
