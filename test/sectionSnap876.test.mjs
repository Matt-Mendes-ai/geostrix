// TASKS.csv #876 — snapping to other strings drawn on the section, and stepping to the parallel section
import { test } from "node:test";
import assert from "node:assert/strict";
import { snapClick, stepSection } from "../src/lib/sectionDigitise.js";

// a section along x from (0, 0); screen = (l, -z) so 1 px = 1 m
const along = (x) => x;
const toScreen = (x, _y, z) => [x, -z];
const hw = { id: "hw", points: [{ l: 0, z: 100, x: 0, y: 0 }, { l: 50, z: 90, x: 50, y: 0, hole_id: "H1", md: 40, snap: "boundary" }, { l: 100, z: 80, x: 100, y: 0, tie: true }] };
const hole = { hole_id: "H9", trace: [{ md: 0, x: 200, y: 0, z: 150 }, { md: 200, x: 200, y: 0, z: -50 }] };

test("#876 a click near another string's vertex takes that vertex exactly (hole snap kept, tie not copied)", () => {
  const p = snapClick({ sx: 53, sy: -88 }, { holes: [hole], targets: [], toScreen, along, strings: [hw] });
  assert.deepEqual(p, { l: 50, z: 90, x: 50, y: 0, hole_id: "H1", md: 40, snap: "boundary" });
  const q = snapClick({ sx: 98, sy: -81 }, { holes: [], targets: [], toScreen, along, strings: [hw] });
  assert.equal(q.snap, "vertex"); assert.equal(q.tie, undefined);
});

test("#876 between vertices: a point along the string; far from everything: no snap; the dragged vertex is skipped", () => {
  const p = snapClick({ sx: 25, sy: -90 }, { holes: [], targets: [], toScreen, along, strings: [hw] });
  assert.equal(p.snap, "line"); assert.ok(Math.abs(p.z - (100 - 0.2 * p.l)) < 1e-9 && p.l > 20 && p.l < 30, JSON.stringify(p)); // on the segment, at the foot of the perpendicular
  assert.equal(snapClick({ sx: 25, sy: -150 }, { holes: [], targets: [], toScreen, along, strings: [hw] }), null);
  const d = snapClick({ sx: 50, sy: -90 }, { holes: [], targets: [], toScreen, along, strings: [hw], skip: { id: "hw", i: 1 } });
  assert.equal(d, null, "a vertex being dragged does not snap to itself or its own two segments");
});

test("#876 a logged boundary still beats a point along a string; hole traces come last", () => {
  const near = { hole_id: "H9", md: 60 }; // at z = 90 on the trace at x = 200
  const s2 = { id: "s2", points: [{ l: 150, z: 95, x: 150, y: 0 }, { l: 250, z: 85, x: 250, y: 0 }] };
  assert.equal(snapClick({ sx: 201, sy: -90 }, { holes: [hole], targets: [near], toScreen, along, strings: [s2] }).snap, "boundary");
  assert.equal(snapClick({ sx: 201, sy: -60 }, { holes: [hole], targets: [], toScreen, along, strings: [s2] }).snap, "trace");
});

test("#876 stepSection: the nearest parallel section on that side, else a new one at the spacing", () => {
  const cur = { id: "a", ax: 0, ay: 0, bx: 1000, by: 0, azimuth: 90 };
  const north = { id: "n", ax: 0, ay: 50, bx: 1000, by: 50 }, far = { id: "f", ax: 0, ay: 150, bx: 1000, by: 150 }, oblique = { id: "o", ax: 0, ay: -40, bx: 1000, by: 200 };
  assert.equal(stepSection(cur, [cur, far, north, oblique], 1).existing.id, "n"); // left of a west-to-east section = north
  const r = stepSection(cur, [cur, north, far, oblique], -1);
  assert.deepEqual(r.create, { ax: 0, ay: -50, bx: 1000, by: -50, azimuth: 90 }); assert.equal(r.offset, -50);
  assert.equal(stepSection(cur, [cur], 1, { fallback: 30 }).create.ay, 30);
});
