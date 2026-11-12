// TASKS.csv #2485 / #2571 — surface-sample placement moved out of ViewerModule.jsx: the TIN-gap case has its own count and
// sentence, the notices show on the Surface Geology tab too, and the structure notice splits ground / off-terrain.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { placeSurfaceSamples, surfacePlacementCounts, samePlacement, structureGroundCounts, surfaceFlatElevation } from "../src/lib/viewer/surfacePlacement.js";

// a 100 x 100 m terrain at 0..100; ground is NaN in the west half's "void" (x < 50) and outside the box
const groundAt = (t, x, y) => (x < 0 || x > 100 || y < 0 || y > 100 || x < 50 ? NaN : 200 + x / 10);
const terrainOf = (kind) => ({ bbox: [0, 0, 100, 100], source: kind ? { kind } : undefined });
const samples = [
  { sample_id: "own", x: 10, y: 10, z: 150 },
  { sample_id: "ground", x: 80, y: 50, z: null },
  { sample_id: "void", x: 20, y: 50, z: null },
  { sample_id: "off", x: 500, y: 50, z: null },
];

test("#2571 a sample over a void of a TIN is flat and counted as a TIN gap, not as outside the terrain", () => {
  const src = new WeakMap();
  const placed = placeSurfaceSamples(samples, terrainOf("tin from points"), 256, groundAt, src);
  const by = Object.fromEntries(placed.map((r) => [r.sample_id, r]));
  assert.equal(by.own, samples[0]);
  assert.equal(by.ground.z, 208); assert.ok(by.ground.zDraped);
  assert.ok(by.void.zFlat && by.void.zTinGap && !by.void.zOutside); assert.equal(by.void.z, 256);
  assert.ok(by.off.zFlat && by.off.zOutside && !by.off.zTinGap);
  assert.equal(src.get(by.void), samples[2]);
  assert.deepEqual(surfacePlacementCounts(samples, placed), { noTerrain: 0, outside: 1, tinGap: 1, unplaced: 0 });
});

test("#606 / #1806 / #1818 a DEM's void leaves the sample out; outside or with no terrain it is flat", () => {
  const dem = placeSurfaceSamples(samples, terrainOf(null), 256, groundAt);
  assert.deepEqual(surfacePlacementCounts(samples, dem), { noTerrain: 0, outside: 1, tinGap: 0, unplaced: 1 });
  const none = placeSurfaceSamples(samples, null, 256, groundAt);
  assert.deepEqual(surfacePlacementCounts(samples, none), { noTerrain: 3, outside: 0, tinGap: 0, unplaced: 0 });
  const allZ = samples.map((r) => ({ ...r, z: 1 }));
  assert.equal(placeSurfaceSamples(allZ, terrainOf(null), 256, groundAt), allZ, "the same array when every sample has a z");
});

test("#1618 samePlacement holds for a new copy at the same heights and breaks when a flag changes", () => {
  const a = placeSurfaceSamples(samples, terrainOf("tin from points"), 256, groundAt);
  const b = placeSurfaceSamples(samples, terrainOf("tin from points"), 256, groundAt);
  assert.notEqual(a, b); assert.ok(samePlacement(a, b));
  const c = a.map((r) => (r.zTinGap ? { ...r, zTinGap: false } : r));
  assert.ok(!samePlacement(a, c));
});

test("#2485 (2) structures without a z: on the ground vs outside / over the gaps", () => {
  const rows = [{ x: 80, y: 10, z: null }, { x: 20, y: 10, z: null }, { x: 900, y: 10 }, { x: 80, y: 10, z: 300 }];
  assert.deepEqual(structureGroundCounts(rows, terrainOf("tin from points"), groundAt), { ground: 1, off: 2 });
  assert.deepEqual(structureGroundCounts(rows, null, groundAt), { ground: 0, off: 0 });
});

test("#2264 the flat elevation: the highest collar underground, else the median collar, else the samples'", () => {
  const collars = [{ z: 100 }, { z: 300 }, { z: 200 }];
  assert.equal(surfaceFlatElevation(collars, [], true), 300);
  assert.equal(surfaceFlatElevation(collars, [], false), 200);
  assert.equal(surfaceFlatElevation([], [{ z: 5 }, { z: 9 }, { z: 7 }], false), 7);
  assert.equal(surfaceFlatElevation([{ z: null }, { z: null }], [], true), 0, "no -Infinity from an empty max");
});

test("#2485 (1) the notices render on the 3D View sidebar and the Surface Geology tab; the TIN sentence gives no terrain advice", () => {
  const vm = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.equal((vm.match(/<SurfacePlacementNotices /g) || []).length, 2);
  const n = readFileSync(new URL("../src/modules/viewer/SurfacePlacementNotices.jsx", import.meta.url), "utf8");
  const tin = n.split(/\r?\n/).find((l) => l.includes("gaps of the terrain triangulated from points"));
  assert.ok(tin && !/Maps > Terrain/.test(tin));
  const smp = readFileSync(new URL("../src/components/SurfaceMappingPanel.jsx", import.meta.url), "utf8");
  assert.match(smp, /structureGroundCounts\(out\.rows, terrain, terrainGroundAt\)/);
});
