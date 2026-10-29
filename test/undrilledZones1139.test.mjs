// TASKS.csv #1139 — undrilled zones inside a modelled unit: blocks farther than the coverage distance from every trace.
import test from "node:test";
import assert from "node:assert/strict";
import { undrilledZones, defaultCellSize } from "../src/lib/undrilledZones.js";
import { unitShell } from "../src/lib/unitVolumes.js";
import { meshVolume } from "../src/lib/unitVolumes.js";

// a closed box solid (world E, N, Z), outward triangles
function box(x0, x1, y0, y1, z0, z1) {
  const positions = new Float64Array([x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0, x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1]);
  const indices = new Uint32Array([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 2, 3, 7, 2, 7, 6, 1, 2, 6, 1, 6, 5, 3, 0, 4, 3, 4, 7]);
  return { positions, indices };
}
const vertical = (x, y, top = 1200, bottom = 800) => [{ x, y, z: top }, { x, y, z: bottom }];

test("#1139 one hole through the middle of a 100 m cube: the cylinder around it is covered, the rest is one zone", () => {
  const unit = box(0, 100, 0, 100, 900, 1000);
  const r = undrilledZones({ solid: unit, traces: [vertical(50, 50)], coverM: 25, cellM: 2 });
  assert.equal(r.unitCells, 50 * 50 * 50);
  const coveredShare = r.coveredCells / r.unitCells;
  assert.ok(Math.abs(coveredShare - (Math.PI * 25 * 25) / 1e4) < 0.01, `covered ${coveredShare}`); // pi r^2 / side^2 = 0.196
  assert.equal(r.zones.length, 1);
  assert.equal(r.zones[0].volumeM3, r.uncoveredCells * 8);
  assert.ok(Math.abs(r.zones[0].centre.x - 50) < 0.5 && Math.abs(r.zones[0].centre.y - 50) < 0.5); // a ring around the hole
  // the blocky shell encloses exactly the uncovered volume
  const s = unitShell(r.block, "not covered");
  assert.ok(Math.abs(meshVolume(s.positions, s.indices) - r.uncoveredCells * 8) < 1e-6 * r.uncoveredCells * 8);
});

test("#1139 two holes leave two separate gaps; a minimum size drops the small one", () => {
  const unit = box(0, 300, 0, 40, 0, 40); // a 300 m long bar
  const traces = [vertical(100, 20, 100, -100), vertical(160, 20, 100, -100)];
  const r = undrilledZones({ solid: unit, traces, coverM: 45, cellM: 5 });
  // covered from about x = 55 to 205 (45 m around each hole, less off the bar's axis): the ends at 0-55 and 205-300 are open
  assert.equal(r.zones.length, 2);
  assert.ok(r.zones[0].centre.x > 205 && r.zones[1].centre.x < 55, JSON.stringify(r.zones.map((z) => z.centre.x)));
  assert.ok(r.zones[0].volumeM3 > r.zones[1].volumeM3);
  const big = undrilledZones({ solid: unit, traces, coverM: 45, cellM: 5, minZoneM3: r.zones[1].volumeM3 + 1 });
  assert.equal(big.zones.length, 1);
  assert.equal(big.ignored.zones, 1);
  assert.equal(big.block.ids.reduce((a, v) => a + v, 0), big.zones[0].cells); // the dropped gap is not in the block
});

test("#1139 a hole beside the unit counts, unless only holes inside the unit count; no holes means all uncovered", () => {
  const unit = box(0, 100, 0, 100, 0, 100);
  const beside = [vertical(110, 50, 200, -100)]; // 10 m outside the east face
  const all = undrilledZones({ solid: unit, traces: beside, coverM: 30, cellM: 5 });
  assert.ok(all.coveredCells > 0);
  const inside = undrilledZones({ solid: unit, traces: beside, coverM: 30, cellM: 5, insideOnly: true });
  assert.equal(inside.coveredCells, 0);
  assert.equal(inside.segments, 0);
  const none = undrilledZones({ solid: unit, traces: [], coverM: 30, cellM: 5 });
  assert.equal(none.uncoveredCells, none.unitCells);
  assert.equal(none.zones.length, 1);
  // an inclined hole: covered along its true 3D path, not its collar position
  const incl = undrilledZones({ solid: unit, traces: [[{ x: 0, y: 50, z: 100 }, { x: 100, y: 50, z: 0 }]], coverM: 10, cellM: 5 });
  assert.ok(incl.coveredCells > 0 && incl.coveredCells < incl.unitCells * 0.25);
});

test("#1139 the default block size is at most half the coverage distance when that fits", () => {
  const unit = box(0, 1000, 0, 1000, 0, 500);
  assert.ok(defaultCellSize(unit.positions, 25) <= 12.5);
  assert.throws(() => undrilledZones({ solid: unit, traces: [], coverM: 0 }), /coverage distance/);
});
