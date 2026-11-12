// TASKS.csv #2467 — every vector import says its CRS the same way: the CRS the file declared by name, what was done, and the datum caveat
// when a datum shift was applied; a file already in the project CRS and a lon / lat KML / GeoJSON say so too
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { vectorToBoundaryPolylines, crsLabel } from "../src/lib/boundaryImport.js";
const read = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");
const rect = (x, y) => [[x, y], [x + 6000, y], [x + 6000, y + 5000], [x, y + 5000], [x, y]];

test("#2467 AGD84 into GDA94: both CRSs by name, and the AGD84 caveat", async () => {
  // SYNTHETIC 6 x 5 km rectangle, AGD84 / AMG zone 51 numbers
  const r = await vectorToBoundaryPolylines({ geomType: "polygon", epsg: 20351, features: [{ parts: [rect(385000, 6684000)], attributes: {} }] }, 28351);
  assert.match(r.note, /^its AGD84 \/ AMG zone 51 \(EPSG:20351\) was reprojected to the project's GDA94 \/ MGA zone 51 \(EPSG:28351\); AGD84: EPSG's national datum shift is applied/);
  assert.ok(!/\.$/.test(r.note)); // the caller ends the sentence
  const dx = r.polylines[0][0].x - 385000, dy = r.polylines[0][0].y - 6684000;
  assert.ok(Math.abs(dx - 137.8) < 3 && Math.abs(dy - 157.9) < 3, `${dx}, ${dy}`); // the review's +137.78 E, +157.89 N
});

test("#2467 the project CRS itself, and the labels", async () => {
  const r = await vectorToBoundaryPolylines({ geomType: "polygon", epsg: 28351, features: [{ parts: [rect(385000, 6684000)], attributes: {} }] }, 28351);
  assert.equal(r.note, "in GDA94 / MGA zone 51 (EPSG:28351), the project's coordinate system");
  assert.equal(crsLabel(999999), "EPSG:999999");
});

test("#2467 KML / GPX / GeoJSON boundaries and claims say their lon / lat, and Maps > A layer gives the datum caveat", () => {
  const g = read("modules/GeophysicsModule.jsx");
  assert.equal((g.match(/note: withLonLatSource\(lonLatNote\(tie\)\)/g) || []).length, 2); // withLonLatSource: #2684 (a Source CRS chosen in the pane is not used, and said)
  assert.match(g, /tr\("its longitude \/ latitude \(WGS 84\) was reprojected to the project's \{dst\}", \{ dst: crsLabel\(project\?\.epsg\) \}\)/);
  assert.match(read("modules/CartographyModule.jsx"), /const dn = datumNote\(objFrom\) \|\| datumNote\(project\.epsg\);/);
});
