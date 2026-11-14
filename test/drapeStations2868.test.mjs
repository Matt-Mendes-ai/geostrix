// TASKS.csv #2859 / #2868 (review GSC geophysics) — (2859) a second and third raster said 'Placed flat at 0 m' while placed at 5 m and 10 m;
// (2868) a grid in a project whose only ground level is its gravity stations went to 0 m (the stations' IDW grid sits at their median, 270 m).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { rasterDrapeElevation, drapeElevationNote, stationsElevation } from "../src/lib/drapeElevation.js";

test("#2859 the 'none' note names its z and the stacking", () => {
  const box = [0, 0, 100, 100];
  const d = rasterDrapeElevation({ bbox: box, rasters: [{ elevation: 0, bbox: box }] });
  assert.equal(d.z, 5); assert.equal(d.source, "none");
  const t = drapeElevationNote(d);
  assert.match(t, /^Placed flat at 5 m: nothing in the project gives a ground level yet/);
  assert.match(t, /It sits 5 m above the raster\(s\) imported before/);
  assert.match(drapeElevationNote(rasterDrapeElevation({ bbox: box })), /^Placed flat at 0 m:/);
});

test("#2868 the survey stations' median elevation when nothing else gives one", () => {
  const stations = [{ x: 10, y: 10, z: 246 }, { x: 20, y: 20, z: 270 }, { x: 30, y: 30, z: 370 }, { x: 5000, y: 5000, z: 900 }];
  const d = rasterDrapeElevation({ bbox: [0, 0, 100, 100], stations });
  assert.deepEqual([d.z, d.source], [270, "stations"], "those under the raster");
  assert.match(drapeElevationNote(d), /^Placed flat at 270 m, the median elevation of the survey stations/);
  assert.equal(stationsElevation(stations, [4000, 4000, 4100, 4100]).z, 270 + (370 - 270) / 2, "none under it: all of them");
  assert.equal(stationsElevation([{ x: 1, y: 1 }]), null, "no z");
  // collars still come first
  assert.equal(rasterDrapeElevation({ collars: [{ x: 50, y: 50, z: 100 }], bbox: [0, 0, 100, 100], stations }).source, "collars");
  // the callers pass the stations
  for (const f of ["modules/RasterModule.jsx", "modules/GeophysicsModule.jsx", "modules/viewer/importPipelineImpl.js"]) assert.ok(fs.readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8").includes("geophys_pts"), f);
  const r = fs.readFileSync(new URL("../src/modules/RasterModule.jsx", import.meta.url), "utf8");
  assert.equal((r.match(/stations: layers\?\.geophys_pts/g) || []).length, 3);
});
