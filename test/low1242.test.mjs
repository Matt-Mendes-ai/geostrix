import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gridCellText } from "../src/lib/raster.js";
import { prjRefusal } from "../src/lib/reproject.js";
import { columnHasNoNumbers, fieldNeedsNumber } from "../src/lib/importChecks.js";
import { pickReport } from "../src/lib/pickDiagnostics.js";
import { mapLayerFeatures } from "../src/lib/overlayExport.js";
import { shapefileZipFiles } from "../src/lib/shapefile.js";

const read = (f) => readFileSync(f, "utf8");
test("#1242 both cell sizes when they differ", () => {
  assert.equal(gridCellText({ dx: 10.7306, dy: 18.3417 }), "10.73 × 18.34 m");
  assert.equal(gridCellText({ dx: 25, dy: 25 }), "25 m");
  assert.equal(gridCellText({ dx: 25, dy: 25.01 }), "25 m");
});
test("#1243 a .prj that was read and refused says why; no .prj or a good one says nothing", () => {
  const prj = (cm) => `PROJCS["NAD_1983_UTM_Zone_10N",GEOGCS["GCS_North_American_1983",DATUM["D_North_American_1983",SPHEROID["GRS_1980",6378137,298.257222101]],PRIMEM["Greenwich",0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",500000],PARAMETER["False_Northing",0],PARAMETER["Central_Meridian",${cm}],PARAMETER["Scale_Factor",0.9996],PARAMETER["Latitude_Of_Origin",0],UNIT["Meter",1]]`;
  assert.equal(prjRefusal(prj(-123)), null);
  assert.match(prjRefusal(prj(-129)), /^NAD_1983_UTM_Zone_10N: .*-129.*-123/);
  assert.equal(prjRefusal(null), null);
  assert.match(prjRefusal('PROJCS["Somewhere_Odd",PROJECTION["Mystery"]]'), /^Somewhere_Odd$/);
});
test("#1257 only a column with no number at all is named", () => {
  assert.equal(columnHasNoNumbers([{ a: "MT23-118" }, { a: "DH-1" }], "a"), true);
  assert.equal(columnHasNoNumbers([{ a: "MT23-118" }, { a: "12.5" }], "a"), false);
  assert.equal(columnHasNoNumbers([{ a: "12,5" }], "a"), false);
  assert.equal(columnHasNoNumbers([{ a: "" }, {}], "a"), false);
  assert.equal(columnHasNoNumbers([], "a"), false);
  assert.ok(fieldNeedsNumber({ key: "x" })); assert.ok(!fieldNeedsNumber({ key: "hole_id" }));
});
test("#1225 a pick on a hole is named by hole and depth", () => {
  const pts = [{ x: 0, y: 0, z: 0, hole_id: "MT23-118", depth: 100 }, { x: 0.5, y: 0, z: 0, hole_id: "MT23-118", depth: 100.5 }];
  const r = pickReport({ label: "Fault: FLT", points: pts, orientations: [] });
  assert.ok(r, "two picks almost on top of each other are reported");
  assert.match(r.duplicateExamples[0], /MT23-118 at 100 m \/ MT23-118 at 100\.5 m/);
  assert.ok(!/drawn contact/.test(r.duplicateExamples[0]));
});
test("#1246 a map layer at no elevation is 2D in the shapefile; one with an elevation keeps z", () => {
  const layer = { geomType: "polygon", features: [{ parts: [[[0, 0], [10, 0], [10, 10], [0, 0]]], attributes: { a: 1 } }] };
  const type = (o) => new DataView(shapefileZipFiles({ ...o, epsg: 26910 }).find((f) => /\.shp$/.test(f.name)).data.buffer).getInt32(32, true);
  const flat = mapLayerFeatures(layer);
  assert.equal(flat.flat, true); assert.equal(type(flat), 5);
  const raised = mapLayerFeatures({ ...layer, drapeMode: "flat", elevation: 900 });
  assert.equal(raised.flat, false); assert.equal(type(raised), 15);
  assert.equal(type({ features: flat.features, geomType: "polygon" }), 15); // every other export stays as it was
});
test("#1245, #1249, #1208, #1260, #1223, #1204 in place", () => {
  assert.match(read("src/lib/projectReproject.js"), /Imported as \$\{l\.crsNote\}; /);
  assert.match(read("src/modules/GeophysicsModule.jsx"), /Source cell ~\{src\} m, mesh spacing ~\{v2\} m/);
  const v = read("src/modules/ViewerModule.jsx");
  assert.match(v, /<VoxelRangeNumber value=\{dispMin\}/); assert.match(v, /<VoxelRangeNumber value=\{dispMax\}/);
  assert.match(v, /setStyleTarget\(null\); setInspectLayer\(styleTarget\.colourKey\)/);
  assert.ok(!v.includes("Imported via the Raster module"));
  assert.match(read("src/modules/GeochemModule.jsx"), /noticeText\(n\) !== noticeText\(a\[i - 1\]\)/);
});
