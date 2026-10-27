// TASKS.csv #927 — a terrain's filled nodes (the mean elevation of a DEM void, or everything outside a TIN built from
// points) are no ground: the samplers return NaN there, as outside the terrain, so the callers' own fallbacks take over.
import test from "node:test";
import assert from "node:assert/strict";
import { terrainFromPoints } from "../src/lib/terrainFromPoints.js";
import { terrainGroundAt, terrainFillAt, sampleTerrainElevation } from "../src/lib/viewer/geomath.js";
import { terrainElevationAt, terrainPoints } from "../src/lib/inversion.js";
import { build3dRequest } from "../src/lib/dcip3d.js";
import { collarTerrainOffsets } from "../src/lib/dataQC.js";

// an L-shaped survey on the plane z = 1000 + 0.5 x: the TIN covers the L, the rest of the box is mean fill
function lTerrain() {
  const points = [];
  for (let x = 0; x <= 1000; x += 50) for (let y = 0; y <= 1000; y += 50) if (x <= 200 || y <= 200) points.push({ x, y, z: 1000 + 0.5 * x });
  return terrainFromPoints({ points });
}

test("#927: over the TIN the ground is the plane; over the fill it is NaN, not the mean", () => {
  const t = lTerrain();
  assert.ok(t.noDataMask, "the TIN leaves filled nodes");
  assert.ok(Math.abs(terrainGroundAt(t, 100, 600) - 1050) < 1e-6);
  assert.ok(Math.abs(terrainGroundAt(t, 800, 100) - 1400) < 1e-6);
  const filled = sampleTerrainElevation(t, 800, 800); // the old reading: the mean fill
  assert.ok(Math.abs(filled - 1400) > 50, `fill ${filled}`);
  assert.ok(Number.isNaN(terrainGroundAt(t, 800, 800)));
  assert.ok(Number.isNaN(terrainElevationAt(t, 800, 800)));
  assert.ok(terrainFillAt(t, 800, 800) && !terrainFillAt(t, 100, 600));
  assert.ok(Number.isNaN(terrainGroundAt(t, -10, 500)), "outside the box is still NaN");
});

test("#927: a terrain with no mask samples exactly as before; a masked node with no weight does not count", () => {
  const plain = { bbox: [0, 0, 200, 200], gridW: 3, gridH: 3, elevations: [1, 2, 3, 4, 5, 6, 7, 8, 9] };
  for (const [x, y] of [[0, 0], [50, 150], [200, 200], [137, 61]]) assert.equal(terrainGroundAt(plain, x, y), sampleTerrainElevation(plain, x, y));
  // node 2 (top-right, x = 200, y = 200) filled: bit 2 of byte 0
  const masked = { ...plain, noDataMask: btoa(String.fromCharCode(1 << 2)) };
  assert.ok(Number.isNaN(terrainGroundAt(masked, 150, 150)), "a cell touching the filled node");
  assert.equal(terrainGroundAt(masked, 100, 150), sampleTerrainElevation(plain, 100, 150), "on the column line the filled node has no weight");
  assert.equal(terrainGroundAt(masked, 50, 50), sampleTerrainElevation(plain, 50, 50));
  // the bytes form (hydrologyClient's) reads the same
  assert.ok(Number.isNaN(terrainGroundAt({ ...plain, noDataMask: Uint8Array.of(1 << 2) }, 150, 150)));
});

test("#927: terrainPoints leaves the filled nodes out and counts them", () => {
  const t = lTerrain();
  const all = terrainPoints({ ...t, noDataMask: null }, t.bbox, 1e6);
  const real = terrainPoints(t, t.bbox, 1e6);
  assert.ok(real.skipped > 0 && real.points.length + real.skipped === all.points.length);
  assert.ok(real.points.every(([x, , z]) => Math.abs(z - (1000 + 0.5 * x)) < 1e-6), "only real ground left");
});

test("#927: the 3D DC/IP request samples no fill and says how many samples it skipped", () => {
  const t = lTerrain();
  const line = { readings: [[50, 500, 1025, 60, 500, 1030, 70, 500, 1035, 80, 500, 1040]], chain: [[0, 10, 20, 30]], rho: [100], stations: [[50, 500, 1025]] };
  const r = build3dRequest([line], t, { core: 25, depth: 100, pct: 5 });
  assert.ok(r.topoSkipped > 0);
  assert.equal(r.topo.length - 1 + r.topoSkipped, 41 * 41);
  assert.ok(r.topo.slice(1).every(([x, , z]) => Math.abs(z - (1000 + 0.5 * x)) < 0.06), "no mean-fill sample (x rounded to 0.1 m, z to 0.01 m)");
});

test("#927: a collar over the fill is not compared with the mean elevation", () => {
  const t = lTerrain();
  const out = collarTerrainOffsets([{ hole_id: "A", x: 100, y: 600, z: 1052 }, { hole_id: "B", x: 800, y: 800, z: 1400 }], t);
  assert.deepEqual(out.map((o) => o.hole_id), ["A"]);
});
