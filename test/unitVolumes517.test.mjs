// TASKS.csv #517 — closed unit volumes from the lithology block.
import test from "node:test";
import assert from "node:assert/strict";
import { unitShell, meshVolume } from "../src/lib/unitVolumes.js";
import { isMeshClosed, buildMeshQuery, isPointInsideMesh } from "../src/lib/meshQuery.js";

function block(nx, ny, nz, idAt, labels = [null, "A", "B"]) {
  const ids = new Int32Array(nx * ny * nz);
  for (let ix = 0; ix < nx; ix++) for (let iy = 0; iy < ny; iy++) for (let iz = 0; iz < nz; iz++) ids[ix * ny * nz + iy * nz + iz] = idAt(ix, iy, iz);
  return { extent: [0, nx * 10, 0, ny * 10, 0, nz * 10], resolution: [nx, ny, nz], ids, labels };
}
const check = (s, expect) => {
  assert.equal(isMeshClosed(s.positions, s.indices).closed, true);
  assert.ok(Math.abs(meshVolume(s.positions, s.indices) - expect) < 1e-6 * expect, `${meshVolume(s.positions, s.indices)} vs ${expect}`);
};

test("#517 a flat 2-unit stack: closed shells with exactly the slab volumes (also at UTM coordinates)", () => {
  const b = block(20, 20, 10, (x, y, z) => (z >= 6 ? 2 : 3));
  const a = unitShell(b, "A", { x: 500000, y: 6000000, z: 1000 }), bb = unitShell(b, "B", { x: 500000, y: 6000000, z: 1000 });
  assert.equal(a.blockVolume, 200 * 200 * 40); check(a, 200 * 200 * 40); check(bb, 200 * 200 * 60);
});

test("#517 a one-cell-thick patch keeps its full volume (a smooth shell lost 77% on the real Harry VCL)", () => {
  const b = block(8, 8, 8, (x, y, z) => (z === 3 && x > 1 && x < 6 ? 2 : 3));
  check(unitShell(b, "A"), 4 * 8 * 1 * 1000);
  const lone = block(5, 5, 5, (x, y, z) => (x === 2 && y === 2 && z === 2 ? 2 : 3));
  check(unitShell(lone, "A"), 1000);
});

test("#517 cells touching only along an edge / at a corner still give a closed (manifold) shell", () => {
  const edge = block(4, 4, 4, (x, y, z) => ((x === 1 && y === 1 && z === 1) || (x === 2 && y === 2 && z === 1) ? 2 : 3));
  check(unitShell(edge, "A"), 2000);
  const corner = block(4, 4, 4, (x, y, z) => ((x === 1 && y === 1 && z === 1) || (x === 2 && y === 2 && z === 2) ? 2 : 3));
  check(unitShell(corner, "A"), 2000);
});

test("#517 inside / outside a unit shell (for estimation domains)", () => {
  const s = unitShell(block(20, 20, 10, (x, y, z) => (z >= 6 ? 2 : 3)), "A");
  const q = buildMeshQuery(s.positions, s.indices);
  assert.equal(isPointInsideMesh(q, { x: 101, y: 103, z: 81 }), true);
  assert.equal(isPointInsideMesh(q, { x: 101, y: 103, z: 31 }), false);
  assert.equal(unitShell(block(2, 2, 2, () => 3), "A"), null);
  assert.equal(unitShell(block(2, 2, 2, () => 3), "C"), null);
});
