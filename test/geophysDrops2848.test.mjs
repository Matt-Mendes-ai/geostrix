// TASKS.csv #2848 — a drop on the Geophysics tab's viewport imports as on its sidebar; a station table offered as a drillhole table points to
// Point survey. #2855 — a .grd dropped on the Geophysics tab is read as a grid. #2849 — survey points keep a floor on screen.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { looksLikeStationTable } from "../src/lib/geophysColumns.js";
import { minSymbolRadiusM, needsSymbolRebuild, GEOPHYS_MIN_PX } from "../src/lib/viewer/symbolScale.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8");

test("#2848 a station table reads as stations; a drillhole table does not", () => {
  assert.equal(looksLikeStationTable(["STATION", "YEAR", "EASTING", "NORTHING", "ELEVATION", "OBSERVED_GRAVITY", "FREEAIR", "BOUGUER"]), true);
  assert.equal(looksLikeStationTable(["X", "Y", "TMI_nT"]), true);
  assert.equal(looksLikeStationTable(["HoleID", "From", "To", "Lith"]), false);
});

test("#2848 wiring: the bare viewport forwards drops, the tab imports them, the dialog offers Point survey", () => {
  const v = read("../src/modules/ViewerModule.jsx");
  assert.match(v, /onDrop=\{bare \? \(e\) => \{ e\.preventDefault\(\); requestModuleAction\("geophysics-drop", \{ files: Array\.from\(e\.dataTransfer\.files \|\| \[\]\) \}\); \}/);
  const g = read("../src/modules/GeophysicsModule.jsx");
  assert.match(g, /const dropFiles = async \(files\) => \{/);
  assert.match(g, /useModuleAction\(\["geophysics-drop"\], \(_a, p\) => \{ if \(p\?\.files\?\.length\) dropFiles\(p\.files\); \}\);/);
  assert.match(g, /onDrop=\{\(e\) => \{ e\.preventDefault\(\); setDragOver\(false\); dropFiles\(Array\.from\(e\.dataTransfer\.files \|\| \[\]\)\); \}\}/);
  assert.match(g, /if \(csvs\.length \|\| xyzs\.length\) setGeoPane\("points"\);/);
  const m = read("../src/components/ImportMappingModal.jsx");
  assert.match(m, /missingRequired\.some\(\(f\) => f\.key === "hole_id"\) && modal\.file && looksLikeStationTable\(modal\.headers\)/);
  assert.match(m, /goToModule\("geophysics"\); requestModuleAction\("geophysics-drop", \{ files: \[file\] \}\);/);
});

test("#2855 a .grd dropped on the Geophysics tab goes to the raster import, and the 3D View's sentence names it", () => {
  const g = read("../src/modules/GeophysicsModule.jsx");
  assert.match(g, /const gxfs = files\.filter\(\(f\) => \/\\\.\(gxf\|grd\)\$\/i\.test\(f\.name\)\);/);
  assert.match(g, /this tab reads CSV, GeoTIFF, GXF, \.grd, XYZ/);
  assert.match(read("../src/modules/viewer/useImportPipeline.js"), /GeoTIFF \/ \.gxf \/ \.grd grids/);
});

test("#2849 the survey points' floor: 5 px across, rebuilt only where the floor matters", () => {
  assert.equal(GEOPHYS_MIN_PX, 5);
  // Blake River at Fit: ~94 km across ~1,000 px -> ~94 m per pixel: a 235 m radius instead of 1.4-4.2 m
  assert.equal(minSymbolRadiusM(94, GEOPHYS_MIN_PX), 235);
  // a 2 km grid at Fit (~2 m per pixel): the floor (5 m) is near the old size; close in (0.2 m/px) it is 0.5 m, under 1.4 m
  assert.ok(minSymbolRadiusM(0.2, GEOPHYS_MIN_PX) < 1.4);
  assert.equal(needsSymbolRebuild(94, 30), true);
  const v = read("../src/modules/ViewerModule.jsx");
  // #3309 — the rule moved into lib/viewer/geophysPts.js with the per-survey build; the 3D View passes the floor
  assert.match(read("../src/lib/viewer/geophysPts.js"), /export const symbolRadius = \(t, minR\) => Math\.max\(1\.4 \+ 2\.8 \* t, minR \* \(1 \+ t\)\);/);
  assert.match(read("../src/lib/viewer/geophysPts.js"), /tr\.scale\.setScalar\(symbolRadius\(t, minR\) \* style\.size\);/);
  assert.match(v, /minR: minSymbolRadiusM\(mpp, GEOPHYS_MIN_PX\)/);
  assert.match(v, /\["geophys_pts", geophysSymbolMppRef, geophysZoomRef, buildGeophysPtsRef,/);
});
