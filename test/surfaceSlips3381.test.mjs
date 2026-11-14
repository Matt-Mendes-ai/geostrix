// TASKS.csv #3381 (#3195, Galore Creek review) — small slips on the Surface Geology tab: two directions for an offline terrain, an export the
// panes promised where there is none, NR / OVB offered as unit names, a flat bed turned to a dip direction of 20.29, the Rock chips hint
// pointing only at the Geochem tab, and the offline terrain taking the samples' GPS heights beside the collars without asking.
// (The sample notice's three rules for one number: #3368.) SYNTHETIC readings.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { bearingsToGrid } from "../src/lib/azimuthRef.js";

const rd = (f) => fs.readFileSync(new URL(f, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("(5) a horizontal reading is not turned to grid north: it has no direction", () => {
  const flat = { x: 350000, y: 6300000, dip: 0, dipDir: 0, strike: null, horizontal: true }, bed = { x: 350000, y: 6300000, dip: 40, dipDir: 90, strike: 0 };
  const r = bearingsToGrid([flat, bed], "true", 32609, "2023-07-01");
  assert.equal(r.rows[0], flat, "unchanged (was dipDir 0 + the convergence)");
  assert.notEqual(r.rows[1].dipDir, 90, "an inclined reading is still turned");
  assert.equal(r.converted, 1);
});

test("(1) one direction for an offline terrain; (2) the export where it is; (6) the drop that works", () => {
  const sm = rd("../src/components/SurfaceMappingPanel.jsx");
  assert.ok(sm.includes("(make one in Maps > Terrain first: fetch one, import a DEM, or offline from points, from the project's samples and collars, or from a block model's top)"));
  for (const f of ["../src/components/InterpretPane.jsx", "../src/components/UnitPolygonPane.jsx"]) {
    const s = rd(f);
    assert.ok(!s.includes("Show, hide, export or remove") && s.includes("export it from its right-click menu in the 3D View's layer list (Map layers)"), f);
  }
  assert.ok(rd("../src/modules/viewer/ViewerParts.jsx").includes('disabledReason="No surface samples yet: drop a rock-chip or soil file on the 3D view, or import it on the Geochem tab"'));
  // the 3D View's Map layers rows do carry the export (the panes now point there)
  assert.match(rd("../src/modules/ViewerModule.jsx"), /overlayExportItems\(l\.name, async \(\) => \(await overlayLib\(\)\)\.mapLayerFeatures\(l\)/);
});

test("(3) cover and no-recovery codes are not offered as unit names to draw", () => {
  const s = rd("../src/components/UnitPolygonPane.jsx");
  assert.match(s, /notUnit\.set\(v, role === "overburden" \|\| role === "no recovery" \|\| role === "ignore"\)/);
  assert.match(s, /const roleOf = roleWithCodes\(modellingCodes\)/);
});

test("(7) the offline terrain asks which elevations: samples and collars, collars only, samples only", () => {
  const g = rd("../src/modules/GeophysicsModule.jsx");
  assert.match(g, /const \[zSource, setZSource\] = useState\("both"\);/);
  assert.match(g, /const samplePts = zUse === "collars" \? \[\] : allSamplePts, collarPts = zUse === "samples" \? \[\] : allCollarPts/);
  assert.ok(g.includes('<option value="collars">{tr("Collars only ({c}): surveyed, usually"'));
  assert.match(g, /disabled=\{terrainBusy \|\| zCount < 3\}/);
});
