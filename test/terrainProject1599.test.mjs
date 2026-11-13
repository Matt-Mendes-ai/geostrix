// TASKS.csv #1599 — terrain from the project's own elevations; the points importer reads the surface-sample spellings
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { guessXYZ, terrainFromPoints } from "../src/lib/terrainFromPoints.js";

test("guessXYZ reads e_utm / n_utm / elev_m (and elev_dem_m, utm_east, x_utm)", () => {
  assert.deepEqual(guessXYZ(["sample_id", "e_utm", "n_utm", "elev_m", "au_ppm"]), { x: "e_utm", y: "n_utm", z: "elev_m" });
  assert.deepEqual(guessXYZ(["UTM_East", "UTM_North", "Elev_DEM_m"]), { x: "UTM_East", y: "UTM_North", z: "Elev_DEM_m" });
  assert.deepEqual(guessXYZ(["x_utm", "y_utm", "elevation_lidar"]), { x: "x_utm", y: "y_utm", z: "elevation_lidar" }, "a header starting elev when nothing else matched");
  assert.deepEqual(guessXYZ(["Easting", "Northing", "Elevation"]), { x: "Easting", y: "Northing", z: "Elevation" });
});

test("samples and collars triangulate into a terrain", () => {
  const pts = [];
  for (let i = 0; i < 20; i++) for (let j = 0; j < 20; j++) pts.push({ x: 600000 + i * 50, y: 6350000 + j * 50, z: 1500 + i * 2 });
  const t = terrainFromPoints({ points: pts, lines: [] }, { gridMax: 64 });
  assert.ok(t.gridW > 2 && t.gridH > 2);
  assert.ok(Math.abs(t.bbox[0] - 600000) < 1);
});

test("wired: the Terrain pane offers the project's samples and collars; Model from map names the offline routes", () => {
  const g = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");
  assert.match(g, /const finishPointsTerrain = async \(\{ points, lines, what, name, sourceFile, reprojected(, misfitAt = null, benchNote = "")?(, leftOutNote = "", spacingFit = false)? \}\)/); // misfitAt, benchNote: #2589; leftOutNote, spacingFit: #2987 / #3036
  assert.match(g, /await finishPointsTerrain\(\{ points, lines, what, name: file\.name\.replace/);
  assert.match(g, /pick\(surfaceSamples\), c = pick\(measured\)/); // #2987 — the collars whose elevation is measured (collarElevationTrust)
  assert.match(g, /projectZPoints\.points\.length >= 3 && \(/);
  const m = readFileSync(new URL("../src/components/MapModelPanel.jsx", import.meta.url), "utf8");
  assert.match(m, /from the project's samples and collars/);
});
