// TASKS.csv #3659 (re-test R2) — the data owner's credit leaves with the data: the drillhole tables zip (provenance.txt line + a data_credit column on collars.csv), the Shapefile zip (a _CREDIT.txt), the GeoPackage
// (the layer's description), the KMZ (the Document's description); and a project rebuilt from the tables gets project.dataCredit back. SYNTHETIC.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { drillholeTableFiles } from "../src/lib/drillholeTables.js";
import { shapefileZipFiles } from "../src/lib/shapefile.js";
import { buildProjectKml } from "../src/lib/projectKmz.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const CREDIT = "Drilling data courtesy of Fireweed Metals Corp.";
const collars = [{ hole_id: "H1", x: 1, y: 2, z: 3, azimuth: 90, dip: 60, length: 100 }];

test("the tables zip: provenance.txt names the credit and collars.csv carries it; with no credit nothing changes", () => {
  const files = drillholeTableFiles({ collars, survey: [], epsg: 26909, version: "x", dataCredit: CREDIT });
  assert.match(files.find((f) => f.name === "provenance.txt").text, /Data credit: Drilling data courtesy of Fireweed Metals Corp\./);
  const c = files.find((f) => f.name === "collars.csv").text.split(/\r?\n/);
  assert.match(c[0], /,epsg,data_credit/); assert.match(c[1], /Fireweed Metals Corp\.$/);
  assert.match(files.find((f) => f.name === "collars_fields.csv").text, /data_credit,the data owner's credit/);
  const none = drillholeTableFiles({ collars, survey: [], epsg: 26909, version: "x" });
  assert.doesNotMatch(none.find((f) => f.name === "collars.csv").text, /data_credit/); assert.doesNotMatch(none.find((f) => f.name === "provenance.txt").text, /Data credit/);
});
test("the Shapefile zip has a credit text; the KMZ and the GeoPackage carry it in their own description", () => {
  const feats = [{ geometry: [[1, 2, 3]], attributes: { hole_id: "H1" } }];
  assert.ok(shapefileZipFiles({ features: feats, geomType: "point", epsg: 26909, baseName: "collars", credit: CREDIT }).some((f) => f.name === "collars_CREDIT.txt"));
  assert.ok(!shapefileZipFiles({ features: feats, geomType: "point", epsg: 26909, baseName: "collars" }).some((f) => /CREDIT/.test(f.name)));
  const kml = buildProjectKml({ projectName: "P", dataCredit: CREDIT, epsg: 32609, collars, survey: [], desurveyMethod: "minimum_curvature", layers: {}, customLayers: [], assays: [], assayElements: [], surfaceSamples: [], surfaceStructures: [], mapLayers: [], boundaries: [], plannedHoles: [], sections: [], rasters: [], layerGroups: [] },
    { toLonLat: (x, y) => [-130 + x / 1e5, 56 + y / 1e5], legendPng: () => ({ bytes: new Uint8Array([1]), width: 1, height: 1 }), rasterImage: () => null }).kml;
  assert.match(kml, /<description>[^<]*Data: Drilling data courtesy of Fireweed Metals Corp\./);
  assert.match(read("../src/lib/gpkg.js"), /layer\.credit \? String\(layer\.credit\)/); assert.match(read("../src/lib/projectKmzExport.js"), /dataCredit: project\.dataCredit/);
  const v = read("../src/modules/ViewerModule.jsx"); assert.match(v, /credit: project\?\.dataCredit \/\* #3659 \*\/ \}\);/); assert.match(v, /geomType, epsg, credit: project\?\.dataCredit/);
  assert.match(read("../src/modules/viewer/drillholeExport.js"), /dataCredit: project\?\.dataCredit \}\); \/\/ custom layers/);
});
test("a project rebuilt from the tables takes the credit back from the data_credit field", () => {
  const a = read("../src/App.jsx");
  assert.match(a, /c\.attrs\.data_credit === "string"/); assert.match(a, /store\.setProjectDataCredit\(hit\.attrs\.data_credit\.trim\(\)\)/); assert.match(a, /const \{ data_credit: _d, \.\.\.rest \} = c\.attrs/);
});
