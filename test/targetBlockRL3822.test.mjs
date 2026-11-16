// TASKS.csv #3822 (Scottie Gold review) — 'Plan a hole to here' from a block-model card said 'type the target elevation there' though the card had read the highest
// block of each column (104.2 at RL 694 m inside the top patch). Synthetic 10 m blocks.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { voxelColumnRL, voxelColumnEvidence, targetElevation } from "../src/lib/evidenceSources.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const g = { x0: 5, yTop: 25, dx: 10, dy: 10, nx: 3, ny: 3 };
// one column over cell (i1, j1) = x 15, y 15: values rise to 9 at RL 700 and fall away; another column at x 5, y 25 with its high at RL 650
const cells = [];
for (let k = 0; k < 9; k++) cells.push({ x: 15, y: 15, z: 600 + k * 25, dx: 10, dy: 10, dz: 25, value: k === 4 ? 9 : 1 + (k % 3) * 0.1 });
cells.push({ x: 5, y: 25, z: 650, dx: 10, dy: 10, dz: 25, value: 3 });
const model = { id: "m", name: "chg", cells };

test("the elevation each column's highest / lowest block sits at, and the mean of the band", () => {
  const hi = voxelColumnRL(g, model, "max"), k = 1 * 3 + 1;
  assert.equal(hi.z[k], 700); assert.equal(hi.value[k], 9);
  assert.equal(hi.z[0], 650);
  assert.ok(Number.isNaN(hi.z[8]), "an empty column");
  assert.equal(voxelColumnRL(g, model, "min").z[k], 600);
  assert.equal(voxelColumnRL(g, model, "mean").z[k], 700);
  // the same value the card scores on
  assert.equal(voxelColumnEvidence(g, model, "max")[k], hi.value[k]);
  // a band keeps only the blocks inside it
  assert.equal(voxelColumnRL(g, model, "max", { zMin: 600, zMax: 650 }).z[k] <= 650, true);
});

test("targetElevation: a hole-grade card first, then the block-model column, then the Level's middle", () => {
  const col = { ...voxelColumnRL(g, model, "max"), how: "max", name: "chg" }, cell = { x: 15, y: 15 };
  assert.deepEqual({ ...targetElevation(cell, [], g, null, undefined, [col]) }, { z: 700, from: "column", how: "max", name: "chg", value: 9 });
  assert.equal(targetElevation(cell, [{ pts: [{ x: 15, y: 15, z: 480, value: 1 }], reach: 100 }], g, null, undefined, [col]).from, "point");
  assert.equal(targetElevation({ x: 25, y: 5 }, [], g, { zMin: 100, zMax: 200 }, undefined, [col]).from, "level", "no block there: the Level's middle as before");
  assert.equal(targetElevation({ x: 25, y: 5 }, [], g, null, undefined, [col]), null);
  assert.equal(targetElevation(cell, [], g, { zMin: 0, zMax: 300 }, undefined, [col]).from, "level", "a column block outside the Level is not used");
});

test("wiring: the pane keeps the columns' RL and the tooltip says where the depth came from", () => {
  const e = read("../src/components/EvidenceOverlayPane.jsx");
  assert.match(e, /out\.cardCols = layers\.filter\(\(l\) => l\.kind === "voxel"\)/);
  assert.match(e, /targetElevation\(c, cardPts, grid, level, undefined, cardCols\)/);
  assert.match(e, /zs\[k\]\?\.from === "column"/);
  for (const l of ["es", "pt", "fr", "ar"]) assert.ok(JSON.parse(read(`../src/locales/${l}.json`))["the centre of the highest block"], l);
});
