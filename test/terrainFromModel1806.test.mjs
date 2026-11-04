// TASKS.csv #1806 (review #1646, Kodiak) — a terrain from the top of a block model's non-air cells
import test from "node:test";
import assert from "node:assert/strict";
import { terrainFromBlockModel } from "../src/lib/terrainFromModel.js";
import { sampleTerrainElevation, terrainGroundAt } from "../src/lib/viewer/geomath.js";

// a 20 x 20 column mesh of 25 m cells; the ground slopes east (1000 m at x = 0 to 1190 m at x = 475) and the air above it is
// no-data (absent); one column (i = 5, j = 7) is missing altogether
function mesh() {
  const cells = [];
  for (let j = 0; j < 20; j++) for (let i = 0; i < 20; i++) {
    if (i === 5 && j === 7) continue;
    const x = 12.5 + i * 25, y = 12.5 + j * 25, ground = 1000 + 10 * i;
    for (let k = 0; k < 60; k++) { const z = 700 + 12.5 + k * 25; if (z + 12.5 <= ground + 1e-9) cells.push({ x, y, z, dx: 25, dy: 25, dz: 25, value: 1 + k }); }
  }
  return cells;
}

test("#1806 the top of each column is the ground; the lattice follows the mesh; a missing column is masked", () => {
  const t = terrainFromBlockModel(mesh());
  assert.ok(t);
  assert.deepEqual([t.gridW, t.gridH], [20, 20]); assert.deepEqual(t.bbox, [12.5, 12.5, 487.5, 487.5]);
  assert.deepEqual(t.stats.nodeM, [25, 25]); assert.equal(t.stats.columns, 399); assert.equal(t.stats.empty, 1);
  assert.deepEqual(t.stats.relief, [1000, 1175], "the top cell's upper face: 1000 at i = 0, 1175 at i = 19 (the 1190 ground rounds down to a cell face)");
  const terrain = { bbox: t.bbox, gridW: t.gridW, gridH: t.gridH, elevations: t.elevations, noDataMask: t.noDataMask };
  assert.equal(sampleTerrainElevation(terrain, 12.5, 100), 1000);
  assert.equal(sampleTerrainElevation(terrain, 262.5, 300), 1100);
  assert.ok(Number.isNaN(terrainGroundAt(terrain, 137.5, 187.5)), "the missing column (i = 5, j = 7) has no ground");
  assert.equal(terrainGroundAt(terrain, 162.5, 187.5), 1050, "its neighbour does (the 1060 ground rounds down to the 1050 cell face)");
});

test("#1806 too few columns, or no finite cell, give null", () => {
  assert.equal(terrainFromBlockModel([{ x: 0, y: 0, z: 0, dx: 1, dy: 1, dz: 1, value: 1 }, { x: 1, y: 0, z: 0, dx: 1, dy: 1, dz: 1, value: 1 }]), null);
  assert.equal(terrainFromBlockModel(mesh().map((c) => ({ ...c, value: NaN }))), null);
  assert.equal(terrainFromBlockModel([]), null);
});
