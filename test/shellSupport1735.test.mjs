// TASKS.csv #1735 (review #1645, Copley) — a grade shell or estimate that leaves out the very composites it was built to show
import test from "node:test";
import assert from "node:assert/strict";
import { samplesInsideShell, topCompositesWithoutBlocks } from "../src/lib/shellSupport.js";

test("#1735 at/above-cutoff samples inside, outside or on an unestimated node of the shell's grid", () => {
  const grid = { origin: { x: 0, y: 0, z: 0 }, cellSize: { dx: 10, dy: 10, dz: 10 }, nx: 4, ny: 1, nz: 1 };
  const values = Float64Array.from([2000, 300, NaN, 1500]); // nodes at x = 0, 10, 20, 30
  const points = [{ x: 1, y: 0, z: 0, value: 1800 }, { x: 11, y: 0, z: 0, value: 1200 }, { x: 19, y: 0, z: 0, value: 5000 }, { x: 29, y: 0, z: 0, value: 50 }, { x: 60, y: 0, z: 0, value: 1000 }];
  const r = samplesInsideShell(points, grid, values, 1000);
  assert.deepEqual(r, { above: 4, inside: 2, outside: 1, noData: 1 }, "the 50 ppm point is not above; x = 60 clamps to the last node (1500: inside)");
});

test("#1735 the top composites with no estimated block within a cell of them", () => {
  const comps = [];
  for (let i = 0; i < 60; i++) comps.push({ x: 100 + i, y: 0, z: 0, value: 10 + i, hole_id: "H1" });
  comps.push({ x: 500, y: 0, z: 0, value: 17921, hole_id: "H2" }); // the discovery intercept, far from every block
  comps.push({ x: 110, y: 0, z: 0, value: 9000, hole_id: "H1" });
  const cells = []; for (let i = 0; i < 20; i++) cells.push({ x: 100 + i * 10, y: 0, z: 0 });
  const r = topCompositesWithoutBlocks(comps, cells, 20.5);
  assert.equal(r.checked, 4, "5% of 62 rounds up to 4 (at least 3)");
  assert.deepEqual(r.unsupported.map((u) => [u.hole_id, u.value, Math.round(u.nearestM)]), [["H2", 17921, 210]]);
  assert.ok(Math.abs(r.reachM - Math.sqrt(3) * 20.5) < 1e-9);
  assert.deepEqual(topCompositesWithoutBlocks([], cells, 20.5), { checked: 0, unsupported: [], reachM: Math.sqrt(3) * 20.5 });
  const none = topCompositesWithoutBlocks(comps, [], 20.5);
  assert.equal(none.unsupported.length, 4); assert.equal(none.unsupported[0].nearestM, null);
});
