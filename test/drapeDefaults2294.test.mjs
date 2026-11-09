// TASKS.csv #2294 (review #2174, WA gold) — what Maps imports gets one elevation rule: a georeferenced scan / spectral map as a GeoTIFF of the
// same footprint (rasterDrapeElevation, said), boundaries / claims / DXF lines with no z by the #2269 rule (the highest collar underground)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rasterDrapeElevation, planElevation } from "../src/lib/drapeElevation.js";

const ug = [];
for (let i = 0; i < 6; i++) ug.push({ hole_id: `U${i}`, x: 100 + i, y: 200, z: 352 - i * 40, dip: i % 2 ? -30 : 60 }); // upholes, stacked
const survey = ug.map((c) => ({ hole_id: c.hole_id, depth: 0, dip: c.dip }));

test("a scan over the collars lands 5 m above the highest one under it, as a GeoTIFF does; a boundary at the highest collar", () => {
  const r = rasterDrapeElevation({ collars: ug, bbox: [0, 0, 300, 400], rasters: [] });
  assert.equal(r.z, 357);
  assert.equal(planElevation({ collars: ug, survey }).z, 352);
});

test("wired: the georeferencer and the spectral import, the boundary / claim imports, the DXF lines", () => {
  const rm = readFileSync(new URL("../src/modules/RasterModule.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(rm, /addRaster\(\{ \.\.\.raster, elevation: defaultElevation \}\)/);
  assert.equal((rm.match(/rasterDrapeElevation\(\{ collars, voxelModels, surfaceSamples, bbox: (raster|list\[0\]\?)\.bbox/g) || []).length, 3); // the GeoTIFF import (#1505), the georeferencer, the spectral import
  const gm = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");
  assert.equal((gm.match(/elevation: boundaryElevation/g) || []).length, 4);
  assert.doesNotMatch(gm, /addBoundary\([^)]*elevation: defaultElevation/);
  assert.match(readFileSync(new URL("../src/modules/viewer/useImportPipeline.js", import.meta.url), "utf8"), /defaultElevation = planElevation\(\{ collars: liveNow\.collars \|\| collars/);
});
