// TASKS.csv #724 — an estimate can be laid on an existing block model's lattice (centroids coincide)
import { test } from "node:test";
import assert from "node:assert/strict";
import { blockModelLattice, snapBoundsToLattice } from "../src/lib/estimationMeta.js";
import { estimateBlockModel } from "../src/lib/estimation.js";

const model = { cells: [] };
for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) model.cells.push({ x: 1003 + i * 10, y: 2005 + j * 10, z: 102.5, dx: 10, dy: 10, dz: 5, value: i }); // corners at 998 / 2000 / 100

test("#724 a regular model's lattice is read; an irregular one is refused", () => {
  assert.deepEqual(blockModelLattice(model), { dx: 10, dy: 10, dz: 5, ox: 998, oy: 2000, oz: 100 });
  assert.equal(blockModelLattice({ cells: [...model.cells, { x: 1003, y: 2005, z: 110, dx: 20, dy: 20, dz: 10, value: 1 }] }), null); // mixed sizes (octree / merged)
  assert.equal(blockModelLattice({ cells: [...model.cells, { x: 1004, y: 2005, z: 102.5, dx: 10, dy: 10, dz: 5, value: 1 }] }), null); // off the lattice
  assert.equal(blockModelLattice({ cells: [] }), null);
});

test("#724 the data box grows outward to whole lattice blocks, and the estimate's centroids land on the model's", () => {
  const L = blockModelLattice(model);
  const b = snapBoundsToLattice({ xmin: 1001.2, xmax: 1033.9, ymin: 2003, ymax: 2021, zmin: 101, zmax: 104 }, L);
  assert.deepEqual(b, { xmin: 998, xmax: 1038, ymin: 2000, ymax: 2030, zmin: 100, zmax: 105 });
  const pts = [{ x: 1010, y: 2012, z: 102, value: 1, hole_id: "A" }, { x: 1025, y: 2018, z: 103, value: 3, hole_id: "B" }];
  const est = estimateBlockModel(pts, { bounds: b, cellSize: { dx: L.dx, dy: L.dy, dz: L.dz }, method: "idw2", searchRadius: 200, lengthWeight: false });
  const centres = new Set(model.cells.map((c) => `${c.x},${c.y},${c.z}`));
  assert.equal(est.cells.length, 12);
  assert.ok(est.cells.every((c) => centres.has(`${c.x},${c.y},${c.z}`)), JSON.stringify(est.cells.slice(0, 3)));
});
