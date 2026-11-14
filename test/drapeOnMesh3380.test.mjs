// TASKS.csv #3380 (#3195, Galore Creek review) — a map layer draped on the terrain built from the collars was holed by the ground: the drape
// was an even plane read bilinearly, the terrain is drawn as two triangles per cell, and inside a twisted cell the two part by more than the
// drape's 0.3 m lift. SYNTHETIC rough terrain (no Galore data).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { terrainMeshElevation, terrainDrapeGrid } from "../src/lib/viewer/terrainDrape.js";
import { sampleTerrainElevation } from "../src/lib/viewer/geomath.js";

// a 60 x 40 grid, nodes 147 m apart, rough (up to +/- 60 m from node to node)
let seed = 5; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const gridW = 60, gridH = 40, dx = 147;
const elevations = new Float32Array(gridW * gridH).map((_, k) => 900 + 0.02 * (k % gridW) * dx + (rnd() - 0.5) * 120);
const terrain = { bbox: [0, 0, (gridW - 1) * dx, (gridH - 1) * dx], gridW, gridH, elevations };
const bbox = [1000.5, 900.25, 2500.75, 3300.5]; // a 1.5 x 2.4 km map, not on the nodes

// the drape's own surface at (x, y), read on its triangles (a-c-b, b-c-d)
function drapeSurface(g, x, y) {
  const W = g.xs.length;
  let k = 0; while (k < W - 2 && g.xs[k + 1] <= x) k++;
  let r = 0; while (r < g.ys.length - 2 && g.ys[r + 1] >= y) r++;
  const tx = (x - g.xs[k]) / (g.xs[k + 1] - g.xs[k]), ty = (g.ys[r] - y) / (g.ys[r] - g.ys[r + 1]);
  const a = g.z[r * W + k], b = g.z[r * W + k + 1], c = g.z[(r + 1) * W + k], d = g.z[(r + 1) * W + k + 1];
  return tx + ty <= 1 ? a + tx * (b - a) + ty * (c - a) : d + (1 - tx) * (c - d) + (1 - ty) * (b - d);
}
const pts = Array.from({ length: 4000 }, () => [bbox[0] + rnd() * (bbox[2] - bbox[0]), bbox[1] + rnd() * (bbox[3] - bbox[1])]);

test("the triangle surface is the drawn mesh: equal to the nodes at the nodes, and the bilinear read parts from it inside cells", () => {
  assert.equal(terrainMeshElevation(terrain, 3 * dx, terrain.bbox[3] - 2 * dx), elevations[2 * gridW + 3]);
  let worst = 0;
  for (const [x, y] of pts) worst = Math.max(worst, terrainMeshElevation(terrain, x, y) - sampleTerrainElevation(terrain, x, y));
  assert.ok(worst > 5, `the old bilinear drape lay ${worst.toFixed(1)} m under the drawn ground somewhere (its lift was 0.3 m): the holes`);
});

test("the drape on the terrain's nodes never lies under the drawn ground", () => {
  const g = terrainDrapeGrid(terrain, bbox);
  assert.equal(g.step, 1);
  assert.ok(g.xs.length > 10 && g.ys.length > 16, "every node column and row inside the box");
  let worst = -Infinity;
  for (const [x, y] of pts) worst = Math.max(worst, terrainMeshElevation(terrain, x, y) - (drapeSurface(g, x, y) + g.extraLift));
  assert.ok(worst <= 1e-6, `the ground rises ${worst} m above the drape`);
  // inside, away from the box's edge cells, it is the drawn ground itself
  const inner = pts.filter(([x, y]) => x > g.xs[1] && x < g.xs[g.xs.length - 2] && y < g.ys[1] && y > g.ys[g.ys.length - 2]);
  for (const [x, y] of inner.slice(0, 500)) assert.ok(Math.abs(terrainMeshElevation(terrain, x, y) - drapeSurface(g, x, y)) < 1e-6);
});

test("a box too big for every node: nodes skipped, and the drape lifted clear of the ones it skips", () => {
  const g = terrainDrapeGrid(terrain, [0, 0, terrain.bbox[2], terrain.bbox[3]], { maxCols: 20 });
  assert.ok(g.step > 1 && g.extraLift > 0);
  for (let j = 0; j < gridH; j++) for (let i = 0; i < gridW; i++) {
    const x = i * dx, y = terrain.bbox[3] - j * dx;
    assert.ok(elevations[j * gridW + i] <= drapeSurface(g, x, y) + g.extraLift + 1e-6, `node ${i},${j}`);
  }
  assert.ok(terrainDrapeGrid(terrain, bbox, { adaptiveError: 1 }).extraLift >= 1.25, "a decimated terrain mesh: its error added");
});

test("the 3D View drapes map layers on that grid, with a polygon offset", () => {
  const s = fs.readFileSync(new URL("../src/lib/viewer/sceneBuilders.js", import.meta.url), "utf8");
  assert.match(s, /const dg = terrainDrapeGrid\(terrain, bbox, \{ adaptiveError \}\);/);
  assert.match(s, /polygonOffset: drapeOnTerrain, polygonOffsetFactor: -2, polygonOffsetUnits: -2/);
});
