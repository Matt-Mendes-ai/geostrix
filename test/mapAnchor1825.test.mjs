// TASKS.csv #1825 (review #1646, Kodiak) — with no drillholes, the map layers' extents fed the full geometry rebuild (and a camera refit)
// even when the view was anchored by something before them (terrain, a raster, boundaries, OMF objects, geophysics points, placed surface
// samples): adding or removing a 3-polygon layer on Kodiak (2,762 samples) froze the window like a full rebuild. Now the key is empty then.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { viewerSource } from "./helpers/viewerSource.mjs"; // #2176 — the drillhole build moved out of ViewerModule

const m = viewerSource();

test("the map layers' extents rebuild the scene only when they are the anchor", () => {
  assert.match(m, /const mapAnchorUsed = !\(terrain\?\.bbox \|\| rasters\?\.\[0\]\?\.bbox \|\| \(boundaries \|\| \[\]\)\.some\(.*\(omfObjects \|\| \[\]\)\.some\(.*layers\.geophys_pts\?\.length \|\| placedSurfaceSamples\.length\);/);
  assert.match(m, /const mapAnchorKey = useMemo\(\(\) => \(mapAnchorUsed \? JSON\.stringify\(/);
  // the same order as the rebuild's anchorBbox, where the map layers come last
  assert.match(m, /const anchorBbox = terrain\?\.bbox \|\| rasters\?\.\[0\]\?\.bbox \|\| boundaryBbox \|\| omfBbox \|\| geophysPtsBbox \|\| surfaceSamplesBbox \|\| mapLayersBbox \|\| null;/);
  assert.ok(m.includes("noHoles && mapAnchorKey"), "still a dependency of the no-hole rebuild, for a map-only project");
});
