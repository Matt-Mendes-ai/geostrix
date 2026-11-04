// TASKS.csv #1877 — solids from design strings: extrude, loft and what a block model holds inside
import test from "node:test";
import assert from "node:assert/strict";
import { extrudeString, loftStrings, solidTonnage } from "../src/lib/stringSolids.js";
import { isMeshClosed } from "../src/lib/meshQuery.js";

const rect = [[0, 0, 500], [100, 0, 500], [100, 50, 500], [0, 50, 500]];
const lShape = [[0, 0, 0], [100, 0, 0], [100, 40, 0], [40, 40, 0], [40, 100, 0], [0, 100, 0]]; // concave, 100x100 minus 60x60

test("an extruded rectangle is a closed box of the right volume, whatever the ring's winding", () => {
  for (const ring of [rect, [...rect].reverse()]) {
    const s = extrudeString(ring, 480, 500);
    assert.ok(Math.abs(s.volume - 100 * 50 * 20) < 1e-6, `volume ${s.volume}`);
    assert.ok(isMeshClosed(s.positions, s.indices));
    assert.equal(s.indices.length / 3, 4 + 8);
  }
  const l = extrudeString(lShape, 0, 10);
  assert.ok(Math.abs(l.volume - (10000 - 3600) * 10) < 1e-6);
  assert.ok(isMeshClosed(l.positions, l.indices));
  assert.equal(extrudeString(rect, 500, 480), null);
});

test("a loft of two squares on two levels is a frustum", () => {
  const lower = { name: "a", vertices: [[0, 0, 100], [100, 0, 100], [100, 100, 100], [0, 100, 100]] };
  const upper = { name: "b", vertices: [[10, 10, 150], [90, 10, 150], [90, 90, 150], [10, 90, 150]] };
  const s = loftStrings([upper, lower], { n: 64 });
  assert.deepEqual(s.levels, [100, 150]);
  const frustum = (50 / 3) * (10000 + 6400 + Math.sqrt(10000 * 6400));
  assert.ok(Math.abs(s.volume - frustum) < frustum * 0.01, `volume ${s.volume} vs ${frustum}`);
  assert.ok(isMeshClosed(s.positions, s.indices));
  assert.equal(loftStrings([lower, { ...upper, vertices: upper.vertices.map((p) => [p[0], p[1], 100]) }]).failed, "same-level");
});

test("tonnes and grade from the blocks inside the solid", () => {
  const s = extrudeString(rect, 480, 500);
  const cells = [];
  for (let x = 5; x < 100; x += 10) for (let y = 5; y < 50; y += 10) cells.push({ x, y, z: 490, dx: 10, dy: 10, dz: 20, value: x < 50 ? 1 : 3 });
  cells.push({ x: 150, y: 25, z: 490, dx: 10, dy: 10, dz: 20, value: 9 }); // outside
  const t = solidTonnage(s.positions, s.indices, cells, 2.5, { cutoff: 2 });
  assert.equal(t.blocks, 50); assert.equal(t.volumeM3, 100000); assert.equal(t.tonnes, 250000);
  assert.ok(Math.abs(t.meanGrade - 2) < 1e-9); assert.equal(t.tonnesAboveCutoff, 125000);
});
