// TASKS.csv #814 — finding isolated cones in the AWS tiles, and telling an artifact from a real peak with Copernicus GLO-30
import test from "node:test";
import assert from "node:assert/strict";
import { findIsolatedCones } from "../src/lib/srtmFetch.js";
import { copTileName, copTilesFor, isArtifactCone } from "../src/lib/copernicusDem.js";
import { gridDims } from "../src/lib/terrainGrid.js";

const W = 400, H = 400, PX = 5.3; // z14-like pixels
const slope = (x, y) => 1500 + 0.2 * x * PX + 0.1 * y * PX; // a gently tilted hillside

test("#814 a 300 m, 200 m wide cone on a hillside is found (Orion's artifact, shape measured from the tiles)", () => {
  const e = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const r = Math.hypot(x - 200, y - 200) * PX; e[y * W + x] = slope(x, y) + 300 * Math.exp(-((r / 55) ** 2)); }
  const c = findIsolatedCones(e, W, H, PX);
  assert.equal(c.length, 1);
  assert.ok(Math.abs(c[0].x - 200) <= 1 && Math.abs(c[0].y - 200) <= 1, JSON.stringify(c[0]));
  assert.ok(c[0].riseM > 150 && c[0].radiusM === 50, JSON.stringify(c[0])); // the first radius that passes (Orion: 203 m at 50 m)
});

test("#814 a summit on a long ridge is not a cone (its ridge stays high on the ring), nor is plain ground", () => {
  const e = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const across = Math.abs(y - 200) * PX, along = Math.abs(x - 200) * PX;
    e[y * W + x] = slope(x, y) + Math.max(0, 400 - 3 * across - 0.4 * along); // steep sides, a ridge falling slowly along x
  }
  assert.equal(findIsolatedCones(e, W, H, PX).length, 0);
  const flat = new Float32Array(W * H).fill(1200);
  const t0 = Date.now();
  assert.equal(findIsolatedCones(flat, W, H, PX).length, 0);
  assert.ok(Date.now() - t0 < 2000, "a plateau is rejected at the first ring sample");
});

test("#814 the artifact rule: GLO-30 shows under 30 % of the rise and 100 m less", () => {
  for (const [aws, cop] of [[203, 48], [409, 57], [156, 27], [380, 56], [240, 18]]) assert.equal(isArtifactCone(aws, cop), true, `${aws}/${cop}`); // Orion, Stewart
  for (const [aws, cop] of [[90, 64], [180, 178], [181, 58], [419, 337], [95, 59]]) assert.equal(isArtifactCone(aws, cop), false, `${aws}/${cop}`); // real: Orion peak, Matterhorn, Devils Tower, Shiprock, Assiniboine
});

test("#814 Copernicus cell names and the cells an area needs", () => {
  assert.equal(copTileName(56, -131), "Copernicus_DSM_COG_10_N56_00_W131_00_DEM");
  assert.equal(copTileName(45, 7), "Copernicus_DSM_COG_10_N45_00_E007_00_DEM");
  assert.equal(copTileName(-34, -71), "Copernicus_DSM_COG_10_S34_00_W071_00_DEM");
  assert.deepEqual(copTilesFor(-130.3, 56.34, -130.2, 56.38).map((t) => t.name), ["Copernicus_DSM_COG_10_N56_00_W131_00_DEM"]);
  assert.equal(copTilesFor(-130.1, 55.9, -129.9, 56.1).length, 4);
  assert.deepEqual(gridDims(0, 0, 1, 1, 200), { gridW: 200, gridH: 200 });
});
