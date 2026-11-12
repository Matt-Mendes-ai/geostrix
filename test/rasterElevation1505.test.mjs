// TASKS.csv #1505 (review #1497, Lawyers) — where a new raster goes with no terrain: above the highest collar under it (no hole
// top hidden), stacked 5 m above a raster already at that level, or at the depth the file name says
import test from "node:test";
import assert from "node:assert/strict";
import { rasterDrapeElevation, depthFromName, drapeElevationNote, defaultDrapeElevation, ABOVE_COLLARS_M, STACK_STEP_M } from "../src/lib/drapeElevation.js";

const collars = [{ x: 0, y: 0, z: 1447 }, { x: 100, y: 100, z: 1797 }, { x: 200, y: 200, z: 1907 }, { x: 5000, y: 5000, z: 2200 }];

test("a depth in the file name", () => {
  assert.equal(depthFromName("Lawyers_GMAG_MVI-Ampl_Depth-100m.tif"), 100);
  assert.equal(depthFromName("Resdepthslice-20m.tif"), 20);
  assert.equal(depthFromName("ip_depth_slice_150m.tif"), 150);
  assert.equal(depthFromName("250m_depth.tif"), 250);
  assert.equal(depthFromName("LawyersMAG_RMI-RTP.tif"), null);
  assert.equal(depthFromName("survey_2022_100m_lines.tif"), null); // a line spacing is not a depth
});

test("a surface grid goes 5 m above the highest collar under it; the collar far outside the box does not count", () => {
  const d = rasterDrapeElevation({ collars, bbox: [-10, -10, 300, 300], fileName: "LawyersMAG_RMI-RTP.tif" });
  assert.deepEqual(d, { z: 1907 + ABOVE_COLLARS_M, source: "collars", above: ABOVE_COLLARS_M, topCollarZ: 1907 });
  assert.equal(rasterDrapeElevation({ collars, fileName: "a.tif" }).z, 2200 + ABOVE_COLLARS_M); // no box: every collar
  assert.match(drapeElevationNote(d), /^Placed flat at 1,912 m, 5 m above the highest collar under it: from the side no hole top is hidden, but seen from above it covers/ /* reworded: #2468 */);
  // the map-layer rule is untouched: the median collar
  assert.deepEqual(defaultDrapeElevation({ collars }), { z: (1797 + 1907) / 2, source: "collars" });
});

test("a second raster at the same level is stacked above the first, and a third above both", () => {
  const first = rasterDrapeElevation({ collars, bbox: [-10, -10, 300, 300], fileName: "a.tif" });
  const second = rasterDrapeElevation({ collars, bbox: [-10, -10, 300, 300], rasters: [{ elevation: first.z }], fileName: "b.tif" });
  assert.equal(second.z, first.z + STACK_STEP_M);
  assert.equal(second.stacked, 1);
  const third = rasterDrapeElevation({ collars, bbox: [-10, -10, 300, 300], rasters: [{ elevation: first.z }, { elevation: second.z }], fileName: "c.tif" });
  assert.equal(third.z, second.z + STACK_STEP_M);
  assert.match(drapeElevationNote(second), /It sits 5 m above the raster\(s\) imported before, so they do not overlap\.$/);
  // a raster far away in elevation does not push it
  assert.equal(rasterDrapeElevation({ collars, bbox: [-10, -10, 300, 300], rasters: [{ elevation: 900 }], fileName: "d.tif" }).stacked, undefined);
});

test("a depth slice sits that far below the ground level, whatever rasters are there", () => {
  const d = rasterDrapeElevation({ collars, bbox: [-10, -10, 300, 300], rasters: [{ elevation: 1912 }], fileName: "Lawyers_GMAG_MVI-Ampl_Depth-100m.tif" });
  assert.equal(d.source, "depth");
  assert.equal(d.z, (1797 + 1907) / 2 - 100); // the median collar (the ground level) minus the depth
  assert.match(drapeElevationNote(d), /^Placed flat at 1,752 m: 100 m below the ground level \(1,852 m\), as the file name's depth says/);
  assert.equal(rasterDrapeElevation({ fileName: "Depth-100m.tif" }).source, "none"); // no ground level at all: the old rule, 0 m
});
