// TASKS.csv #3059 (split from #3007) — lengthWeightedPercentile / segmentSummary took 3.2 s on 147,000 samples (the Estimation dialog's P99 on
// an element change). Now: rows that never overlap skip the breakpoint walk, the hole grouping is done once per assay list, and the values
// are sorted natively into typed arrays. The answers must not change.
import test from "node:test";
import assert from "node:assert/strict";
import { resolvedSegments, lengthWeightedPercentile, capAudit } from "../src/lib/geochem.js";

const units = { Au: "ppm" };
const seg = (s) => [s.from, s.to, s.value, s.lt];
// disjoint rows: gaps, touching rows, a sub-EPS row, a missing value, '<' and '>' results
const R = [
  { hole_id: "A", from: 0, to: 1, values: { Au: 0.5 } },
  { hole_id: "A", from: 1, to: 2.5, values: { Au: 0.0025 }, qualifiers: { Au: "<" } },
  { hole_id: "A", from: 3, to: 4, values: { Au: 12 }, qualifiers: { Au: ">" } },
  { hole_id: "A", from: 4, to: 4.0000004, values: { Au: 9 } },
  { hole_id: "A", from: 5, to: 6, values: {} },
  { hole_id: "A", from: 6, to: 8, values: { Au: 1.1 } },
];

test("disjoint rows (the fast path) give exactly the segments of the breakpoint walk", () => {
  const fast = resolvedSegments(R.map((r) => ({ ...r })), "Au", "ppm", units).map(seg);
  // the same rows plus an overlapping pair far below them: that hole takes the walk, and the rows above give the same segments
  const P = [{ hole_id: "A", from: 100, to: 102, values: { Au: 2 } }, { hole_id: "A", from: 101, to: 103, values: { Au: 4 } }];
  const walk = resolvedSegments([...R, ...P].map((r) => ({ ...r })), "Au", "ppm", units).map(seg).filter((s) => s[0] < 100);
  assert.deepEqual(fast, walk);
  assert.deepEqual(fast, [[0, 1, 0.5, false], [1, 2.5, 0.0025, true], [3, 4, 12, false], [6, 8, 1.1, false]]);
});

test("overlaps, exact duplicates and repeats at one depth are resolved as before", () => {
  const a = [
    { hole_id: "H", from: 0, to: 2, values: { Au: 1 } },
    { hole_id: "H", from: 0, to: 2, values: { Au: 1 } }, // an exact duplicate: dropped
    { hole_id: "H", from: 0, to: 2, values: { Au: 3 } }, // same depths, another value: averaged with the first
    { hole_id: "H", from: 1, to: 3, values: { Au: 5 } },
  ];
  assert.deepEqual(resolvedSegments(a, "Au", "ppm", units).map(seg), [[0, 1, 2, false], [1, 2, 3, false], [2, 3, 5, false]]);
  assert.equal(a.some((r) => Object.keys(r).some((k) => !["hole_id", "from", "to", "values"].includes(k))), false, "the rows are not written on");
});

test("the percentile and the cap audit read the sorted typed arrays: equal values in any order, lengths kept", () => {
  const a = [
    { hole_id: "A", from: 0, to: 1, values: { Au: 2 } }, { hole_id: "A", from: 1, to: 4, values: { Au: 2 } },
    { hole_id: "B", from: 0, to: 2, values: { Au: 0.5 } }, { hole_id: "B", from: 2, to: 3, values: { Au: 10 } }, { hole_id: "C", from: 0, to: 1, values: { Au: -0 } },
  ];
  // by length: 0 (1 m), 0.5 (2 m), 2 (4 m), 10 (1 m) of 8 m
  assert.equal(lengthWeightedPercentile(a, "Au", "ppm", units, 30), 0.5);
  assert.equal(lengthWeightedPercentile(a, "Au", "ppm", units, 80), 2);
  assert.equal(lengthWeightedPercentile(a, "Au", "ppm", units, 99), 10);
  const c = capAudit(a, "Au", "ppm", units, 2);
  assert.deepEqual([c.nSamples, c.nCapped, c.lenCapped, c.metalBefore, c.metalAfter], [5, 1, 1, 0.5 * 2 + 2 * 4 + 10, 0.5 * 2 + 2 * 4 + 2]);
});

test("147,000 samples: a cold percentile per element stays well under the old cost", () => {
  let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const a = [];
  for (let h = 0; h < 6390; h++) for (let i = 0; i < 23; i++) a.push({ hole_id: `H${h}`, from: i * 2, to: i * 2 + 2, values: { Fe: 20 + 40 * rnd(), Au: Math.exp(3 * rnd() - 3) } });
  const t0 = performance.now();
  lengthWeightedPercentile(a, "Au", "ppm", units, 99);
  lengthWeightedPercentile(a, "Fe", "%", { Fe: "%" }, 99);
  const ms = performance.now() - t0;
  assert.ok(ms < 4000, `${ms.toFixed(0)} ms for two elements (about 0.4 s on the dev machine; 1.2 s before #3059). The bound catches a return to a quadratic walk, not jitter`);
});
