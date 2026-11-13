// TASKS.csv #2801 (an imported solid's checks said), #2759 (GeoJSON export), #2774 (a map layer's CRS by name), #2808 (latitude / longitude in
// the status bar). #2821 was side 6's (599cb3aa): its own test.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { solidCheckNote, solidProblems } from "../src/lib/solidCheckNote.js";
import { featuresToGeoJson } from "../src/lib/overlayExport.js";
import { buildLayer } from "../src/lib/mapLayerBuild.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8");
const tet = { positions: new Float64Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]), indices: new Uint32Array([0, 2, 1, 0, 1, 3, 1, 2, 3, 0, 3, 2]) };

test("#2801 an imported solid's checks, part by part, with 'weld' for repeated vertices", () => {
  assert.match(solidCheckNote([tet], () => "pit"), /^Checked as solids: 1 closed, without bow-ties/);
  const sheet = { positions: new Float64Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 9, 9, 9]), indices: new Uint32Array([0, 1, 2]) };
  const n = solidCheckNote([tet, sheet], (k) => ["pit", "topo"][k]);
  assert.match(n, /topo: open: 3 edge\(s\) on the border \(a surface, not a closed solid\); 1 vertex\(es\) no triangle uses\./);
  assert.match(n, /1 part\(s\) are clean closed solids\./);
  assert.match(solidCheckNote([tet], () => "big", { maxTriangles: 2 }), /Not checked \(over 2 triangles\): big\./);
  assert.match(solidProblems({ coincidentVertices: 4 }).join(), /4 vertex\(es\) repeated at the same place \(weld them/);
  assert.match(read("../src/modules/ViewerModule.jsx"), /import\("\.\.\/lib\/solidCheckNote\.js"\)\.then\(\(\{ solidCheckNote \}\) =>/);
  assert.match(read("../src/components/SurfaceSolidsPanel.jsx"), /repeated at the same place \(weld them in the program that made the file\)/);
});

test("#2759 GeoJSON: WGS 84 longitude / latitude, properties, outer rings counter-clockwise", () => {
  const toLonLat = (x, y) => [x / 1000, y / 1000];
  const poly = JSON.parse(featuresToGeoJson({ geomType: "polygon", features: [{ attributes: { unit: "Kgd", note: "" }, geometry: [[0, 0], [0, 1000], [1000, 1000], [1000, 0]] }] }, { toLonLat, name: "units" }));
  assert.equal(poly.type, "FeatureCollection");
  assert.deepEqual(poly.features[0].properties, { unit: "Kgd" });
  const ring = poly.features[0].geometry.coordinates[0];
  let a = 0; for (let i = 0; i < ring.length - 1; i++) a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  assert.ok(a > 0, "counter-clockwise"); // the input ring was clockwise
  assert.deepEqual(ring[0], ring[ring.length - 1]);
  const lines = JSON.parse(featuresToGeoJson({ geomType: "polyline", features: [{ attributes: {}, parts: [[[0, 0, 5], [1000, 0, 6]], [[0, 1000], [1000, 1000]]] }] }, { toLonLat }));
  assert.equal(lines.features[0].geometry.type, "MultiLineString");
  assert.deepEqual(lines.features[0].geometry.coordinates[0][0], [0, 0, 5]);
  assert.match(read("../src/modules/ViewerModule.jsx"), /\{ label: tr\("Export GeoJSON \(WGS 84\)…"\), onClick: async \(\) => exportVectorKML\(label, await build\(\), \{\}, "geojson"\) \}/);
});

test("#2774 a map layer names its CRS (and the project's)", () => {
  const parsed = (epsg) => ({ epsg, geomType: "point", features: [{ parts: [[[500000, 5800000]]], attributes: {} }] });
  assert.equal(buildLayer(parsed(26909), { sourceName: "n", projectEpsg: 26910 }).crsNote, "reprojected NAD83 / UTM zone 9N (EPSG:26909) → NAD83 / UTM zone 10N (EPSG:26910)");
  assert.equal(buildLayer(parsed(26910), { sourceName: "n", projectEpsg: 26910 }).crsNote, "in NAD83 / UTM zone 10N (EPSG:26910), the project's coordinate system");
});

test("#2808 the status bar gives latitude / longitude where the project has a real CRS", () => {
  assert.match(read("../src/App.jsx"), /project\.crsSet !== false && project\.epsg && isMetricProjectedEpsg\(project\.epsg\) && getProj4DefSync\(project\.epsg\) \? reprojectXY\(cursor\.x, cursor\.y, project\.epsg, 4326\)/);
});

test("#3229 the latitude / longitude only where the cursor is a world position (not Layout's page)", () => {
  const a = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(a, /<StatusBar worldCursor=\{viewerShown \|\| active === "maps"\}/);
  assert.match(a, /const ll = worldCursor \/\* TASKS\.csv #3229/);
});
