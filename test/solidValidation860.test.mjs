// TASKS.csv #860 — refusing outlines that cannot be linked, validating a closed mesh as a solid (self-intersections,
// winding), and counting inverted columns in Solid blocks. Cases from the #855 review.
import test from "node:test";
import assert from "node:assert/strict";
import { linkOutlines, loopSelfIntersects } from "../src/lib/wireframe.js";
import { validateSolid, isValidSolid } from "../src/lib/meshValidate.js";
import { surfacesToBlock } from "../src/lib/surfaceSolids.js";

// a closed outline on a N-S... E-W vertical section at northing y: rectangle w x h centred at (cx, cz)
const rect = (y, cx, cz, w, h, section) => ({ ax: 0, ay: y, bx: 1000, by: y, section, points: [[cx - w / 2, cz - h / 2], [cx + w / 2, cz - h / 2], [cx + w / 2, cz + h / 2], [cx - w / 2, cz + h / 2]].map(([x, z]) => ({ x, y, z })) });

test("#860 linkOutlines refuses a branch on one section, non-parallel sections, one plane, a self-crossing or flat outline", () => {
  assert.throws(() => linkOutlines([rect(0, 500, 500, 80, 50, "S1"), rect(50, 450, 500, 30, 50, "S2"), rect(50, 560, 500, 30, 50, "S2")]), /branches/);
  const ns = { ax: 500, ay: -100, bx: 500, by: 900, section: "NS", points: [[0, 450], [80, 450], [80, 550], [0, 550]].map(([yy, z]) => ({ x: 500, y: yy, z })) };
  assert.throws(() => linkOutlines([rect(0, 500, 500, 80, 50, "S1"), ns]), /not parallel/);
  assert.throws(() => linkOutlines([rect(0, 500, 500, 80, 50, "S1"), rect(0.5, 520, 500, 80, 50, "S1b")]), /same plane/);
  const eight = { ...rect(50, 500, 500, 80, 50, "S2"), points: [[460, 475], [540, 525], [540, 475], [460, 525]].map(([x, z]) => ({ x, y: 50, z })) };
  assert.throws(() => linkOutlines([rect(0, 500, 500, 80, 50, "S1"), eight]), /crosses itself/);
  const flat = { ...rect(50, 500, 500, 80, 50, "S2"), points: [[460, 500], [500, 500], [540, 500]].map(([x, z]) => ({ x, y: 50, z })) };
  assert.throws(() => linkOutlines([rect(0, 500, 500, 80, 50, "S1"), flat]), /almost no area/);
});

test("#860 a clean link and a pinch-out still link, and validate as solids", () => {
  const w = linkOutlines([rect(0, 500, 500, 80, 50, "S1"), rect(50, 500, 500, 80, 50, "S2"), rect(100, 520, 490, 60, 40, "S3")]);
  const v = validateSolid(w.positions, w.indices);
  assert.ok(isValidSolid(v), JSON.stringify(v));
  const pinch = linkOutlines([rect(0, 500, 500, 80, 50, "S1"), rect(50, 500, 500, 2, 2, "S2")]);
  assert.ok(isValidSolid(validateSolid(pinch.positions, pinch.indices)));
});

test("#860 loopSelfIntersects", () => {
  assert.equal(loopSelfIntersects([[0, 0], [1, 0], [1, 1], [0, 1]]), false);
  assert.equal(loopSelfIntersects([[0, 0], [1, 1], [1, 0], [0, 1]]), true);
});

// two closed boxes that overlap, as one mesh: closed and consistently wound, but self-intersecting
const box = (x0, y0, z0, s, base) => {
  const p = [];
  for (const [dx, dy, dz] of [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]]) p.push(x0 + dx * s, y0 + dy * s, z0 + dz * s);
  const f = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
  return { p, f: f.flat().map((i) => i + base) };
};

test("#860 validateSolid: one box is valid; two overlapping boxes in one mesh cross themselves; a flipped face is a winding conflict", () => {
  const a = box(0, 0, 0, 10, 0);
  assert.ok(isValidSolid(validateSolid(Float64Array.from(a.p), Uint32Array.from(a.f))));
  const b = box(3, 4, 5, 10, 8); // off the faces' diagonals
  const v2 = validateSolid(Float64Array.from([...a.p, ...b.p]), Uint32Array.from([...a.f, ...b.f]));
  assert.equal(v2.openEdges, 0);
  assert.ok(v2.selfIntersectingPairs > 0, "the boxes' faces cross");
  const f = a.f.slice(); [f[1], f[2]] = [f[2], f[1]];
  const v3 = validateSolid(Float64Array.from(a.p), Uint32Array.from(f));
  assert.ok(v3.windingConflicts > 0);
});

const flat = (name, z, extra) => {
  const positions = [-10, -10, z, 110, -10, z, 110, 110, z, -10, 110, z];
  return { name, positions: Float64Array.from(positions), indices: Uint32Array.from([0, 1, 2, 0, 2, 3]), ...extra };
};
test("#860 surfacesToBlock counts columns with a base above its own top, and crossing tops", () => {
  const tilt = (name, z0, z1, extra) => ({ name, positions: Float64Array.from([-10, -10, z0, 110, -10, z1, 110, 110, z1, -10, 110, z0]), indices: Uint32Array.from([0, 1, 2, 0, 2, 3]), ...extra });
  const box0 = [0, 100, 0, 100, 0, 150];
  // base tilted from 80 (west) to 120 (east) under a flat top at 100: inverted in the east half
  const r = surfacesToBlock({ tops: [flat("Top A", 100, { unit: "A" }), tilt("Base A", 80, 120, { unit: "A", role: "base" })], extent: box0, cell: 10 });
  assert.ok(r.inverted.baseAboveTop >= 30 && r.inverted.baseAboveTop <= 60, `${r.inverted.baseAboveTop} columns`);
  // a lower unit's top rising above the upper unit's top in the east
  const r2 = surfacesToBlock({ tops: [flat("Top U", 100), tilt("Top L", 60, 130)], extent: box0, cell: 10 });
  assert.ok(r2.inverted.crossingTops >= 20, `${r2.inverted.crossingTops} columns`);
  const ok = surfacesToBlock({ tops: [flat("Top U", 100), flat("Top L", 60)], extent: box0, cell: 10 });
  assert.deepEqual([ok.inverted.baseAboveTop, ok.inverted.crossingTops], [0, 0]);
});
