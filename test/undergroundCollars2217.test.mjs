// TASKS.csv #2217 — collars drilled from underground are not a ground surface: no estimate block is cut 'above the ground'
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { collarsLookUnderground } from "../src/lib/pitShell.js";

const surface = Array.from({ length: 30 }, (_, i) => ({ hole_id: `S${i}`, x: 1000 + (i % 6) * 50, y: 2000 + Math.floor(i / 6) * 50, z: 400 + (i % 3), dip: 60 }));

test("a surface program is not underground", () => {
  const r = collarsLookUnderground(surface, surface.map((c) => ({ hole_id: c.hole_id, depth: 0, dip: 60 })));
  assert.deepEqual(r, { underground: false, upward: 0, stacked: 0 });
});

test("upward holes (collar or survey dip below 0) or collars stacked on levels make it underground", () => {
  const up = [...surface, { hole_id: "U1", x: 1010, y: 2010, z: 150, dip: -10 }, { hole_id: "U2", x: 1060, y: 2010, z: 150, dip: 45 }];
  const r = collarsLookUnderground(up, [{ hole_id: "U2", depth: 30, dip: -5 }]);
  assert.equal(r.upward, 2); assert.equal(r.underground, true);
  const levels = [...surface, ...[0, 1, 2].map((k) => ({ hole_id: `L${k}`, x: 1001 + k * 50, y: 2001, z: 250 - k * 30, dip: 60 }))];
  const s = collarsLookUnderground(levels, []);
  assert.equal(s.stacked, 3); assert.equal(s.underground, true);
  // Woodjam-like: a big surface compilation with two duplicate collars at conflicting elevations
  const big = Array.from({ length: 500 }, (_, i) => ({ hole_id: `B${i}`, x: (i % 25) * 40, y: Math.floor(i / 25) * 40, z: 900, dip: 60 }));
  assert.equal(collarsLookUnderground([...big, { hole_id: "D1", x: 1, y: 1, z: 950 }, { hole_id: "D2", x: 41, y: 1, z: 960 }], []).underground, false);
  assert.equal(collarsLookUnderground([...surface, { hole_id: "T", x: 1001, y: 2001, z: 250, dip: 60 }], []).underground, false, "one stacked pair alone (a typo or re-surveyed collar) is not enough");
});

test("the dialog turns the cut off and says why", () => {
  const m = readFileSync(new URL("../src/components/GradeEstimationModal.jsx", import.meta.url), "utf8");
  assert.ok(m.includes('const underground = useMemo(() => (groundSource === "collars" ? collarsLookUnderground(collars, survey) : null), [groundSource, collars, survey]);'));
  assert.ok(m.includes("const cutAtGround = belowGround && !underground?.underground;"));
  assert.ok(m.includes("if (groundAt && cutAtGround) {"));
  assert.ok(m.includes("disabled={!!underground?.underground}"));
  assert.ok(m.includes('tr("Off: the collars look like underground collars ({upward} hole(s) drilled upward'));
});
