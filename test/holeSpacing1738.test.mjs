// TASKS.csv #1738 (review #1645, Copley) — a zero-block estimate says why: the holes are farther apart than two search radii
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { holeSpacingSummary, zeroBlockAdvice } from "../src/lib/holeSpacing.js";

// Copley-like: a 103 m pair and three lone holes 305-1,348 m from their nearest neighbour; a pad of two collars 3 m apart is one site
const collars = [
  { hole_id: "A", x: 0, y: 0 }, { hole_id: "B", x: 103, y: 0 },
  { hole_id: "C", x: 103, y: 305 }, { hole_id: "D", x: 1000, y: 900 }, { hole_id: "D2", x: 1003, y: 900 },
  { hole_id: "E", x: 2300, y: 900 }, { hole_id: "F", x: NaN, y: 1 },
];

test("#1738 the spacing summary clusters pads and reports nearest / median / farthest neighbour distances", () => {
  const s = holeSpacingSummary(collars);
  assert.equal(s.sites, 5, "D and D2 are one pad, F has no position");
  assert.equal(s.nearestM, 103);
  assert.ok(Math.abs(s.farthestM - 1298.5) < 0.1, String(s.farthestM)); // E to the D pad centre (2300 - 1001.5)
  assert.equal(s.medianM, 305);
  assert.equal(holeSpacingSummary([collars[0]]), null);
  assert.equal(holeSpacingSummary([]), null);
});

test("#1738 zero blocks with min 2 holes and a 50 m radius on 103 m spacing: holes apart, 55 m would be needed", () => {
  const spacing = holeSpacingSummary(collars);
  assert.deepEqual(zeroBlockAdvice({ blocksEstimated: 0, searchRadiusM: 50, minHoles: 2, spacing }), { kind: "holes-apart", radiusNeededM: 55 });
  assert.deepEqual(zeroBlockAdvice({ blocksEstimated: 0, searchRadiusM: 60, minHoles: 2, spacing }), { kind: "radius", radiusNeededM: null }, "the pair is in reach: another rule emptied it");
  assert.deepEqual(zeroBlockAdvice({ blocksEstimated: 0, searchRadiusM: 50, minHoles: 1, spacing }), { kind: "radius", radiusNeededM: null });
  assert.equal(zeroBlockAdvice({ blocksEstimated: 64, searchRadiusM: 50, minHoles: 2, spacing }), null);
  assert.deepEqual(zeroBlockAdvice({ blocksEstimated: 0, searchRadiusM: 0, minHoles: 2, spacing }), { kind: "radius", radiusNeededM: null }, "no radius limit");
});

test("#1738 the estimation dialog shows the spacing under the radius and the advice on a zero-block run", () => {
  const m = readFileSync(new URL("../src/components/GradeEstimationModal.jsx", import.meta.url), "utf8");
  assert.ok(m.includes("holeSpacingSummary(collars)") && m.includes("zeroBlockAdvice({"));
  assert.ok(m.includes("No block has samples from {k} holes within {r} m"));
});
