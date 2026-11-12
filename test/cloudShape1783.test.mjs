// TASKS.csv #1783 (review #1646, Kodiak) — a 3D point cloud is told from a surface survey, and gridded one depth slice at a time
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cloudShape } from "../src/lib/cloudShape.js";

// a ground survey over a hillside: 50 m stations, z following a 10 % slope with a little scatter
const surface = [];
for (let i = 0; i < 40; i++) for (let j = 0; j < 40; j++) surface.push({ x: 50 * i, y: 50 * j, z: 1000 + 5 * i + ((i * 7 + j * 3) % 5), value: 1 });
// an inversion mesh as points: a 20 x 20 plan of 5 m nodes, 30 layers from -100 to 1,350 m
const cloud = [];
for (let i = 0; i < 20; i++) for (let j = 0; j < 20; j++) for (let k = 0; k < 30; k++) cloud.push({ x: 5 * i + (k % 3), y: 5 * j + (k % 2), z: -100 + 50 * k, value: 1 });

test("#1783 a surface survey is not 3D (its elevations follow the ground); an inversion mesh is", () => {
  const s = cloudShape(surface);
  assert.ok(Math.abs(s.spacing - 50) < 5, String(s.spacing));
  assert.ok(s.spread < 1 && !s.is3D, JSON.stringify(s));
  const c = cloudShape(cloud);
  assert.ok(c.is3D && c.spread > 10, JSON.stringify(c));
  assert.deepEqual([c.zMin, c.zMax, c.n], [-100, 1350, 12000]);
  assert.equal(cloudShape(surface.slice(0, 10)), null);
  assert.equal(cloudShape(surface.map(({ z, ...p }) => p)).is3D, false, "no elevations: a map");
});

test("#1783 the IDW pane grids the chosen slice of a 3D cloud and names it; Spatial analysis says what its means are over", () => {
  const g = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");
  assert.ok(g.includes("const pts = idwSlice; // #1783") && g.includes("`${label}${sliceTag} IDW ${idwCellSize} m")); // the name is wrapped in uniqueName since #2562
  const s = readFileSync(new URL("../src/components/SpatialAnalysis.jsx", import.meta.url), "utf8");
  assert.ok(s.includes('tr("Left out (same plan position)")') && s.includes("A 3D point cloud ({lo} to {hi} m elevation)"));
});
