import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { veinSolidFromSurfaces } from "../src/lib/veinSolid.js";
import { parseKML, kmlToMapLayers } from "../src/lib/kml.js";
import { buildLayer } from "../src/lib/mapLayerBuild.js";

// two concentric cylindrical sheets R and R + 20 apart, so 20 m along the normal everywhere, steepening to halfAngle at the flanks
function arc(R, halfAngle, nA = 90, nL = 8, L = 400) {
  const positions = [], indices = [];
  for (let j = 0; j <= nL; j++) for (let i = 0; i <= nA; i++) {
    const a = -halfAngle + (2 * halfAngle * i) / nA;
    positions.push(R * Math.sin(a), (L * j) / nL, R * Math.cos(a));
  }
  const id = (i, j) => j * (nA + 1) + i;
  for (let j = 0; j < nL; j++) for (let i = 0; i < nA; i++) indices.push(id(i, j), id(i + 1, j), id(i + 1, j + 1), id(i, j), id(i + 1, j + 1), id(i, j + 1));
  return { positions: Float64Array.from(positions), indices: Uint32Array.from(indices) };
}
test("#1228 a uniform 20 m pair reads about 20 m where the sheet steepens", () => {
  const hw = arc(320, Math.PI / 3), fw = arc(300, Math.PI / 3);
  const r = veinSolidFromSurfaces(hw, fw, { cells: 60 });
  assert.ok(Math.abs(r.thickness.mean - 20) < 0.6, `mean ${r.thickness.mean}`);
  assert.ok(r.thickness.min > 18.5 && r.thickness.max < 21.5, `${r.thickness.min} - ${r.thickness.max}`);
  // the volume is the sheet's: 20 m x the mean arc length x the length, to within the stepped edges
  const exact = 20 * 310 * ((2 * Math.PI) / 3) * 400;
  assert.ok(r.volume > exact * 0.85 && r.volume < exact * 1.02, `${r.volume} vs ${exact}`);
});
test("#1247 KML: one layer per kind, a placemark's rings stay one polygon, fields kept", () => {
  const kml = `<kml><Document>
   <Placemark><name>Showing 1</name><ExtendedData><Data name="grade"><value>2.5</value></Data></ExtendedData><Point><coordinates>-121.3,52.2,0</coordinates></Point></Placemark>
   <Placemark><name>Fault</name><LineString><coordinates>-121.3,52.2 -121.2,52.3</coordinates></LineString></Placemark>
   <Placemark><name>Unit</name><Polygon><outerBoundaryIs><LinearRing><coordinates>-121,52 -120,52 -120,53 -121,52</coordinates></LinearRing></outerBoundaryIs><innerBoundaryIs><LinearRing><coordinates>-120.8,52.2 -120.6,52.2 -120.6,52.4 -120.8,52.2</coordinates></LinearRing></innerBoundaryIs></Polygon></Placemark>
   <Placemark><name>Other</name><Polygon><outerBoundaryIs><LinearRing><coordinates>-122,52 -121.5,52 -121.5,53 -122,52</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>
  </Document></kml>`;
  const layers = kmlToMapLayers(parseKML(kml).features);
  assert.deepEqual(layers.map((l) => [l.geomType, l.features.length, l.epsg]), [["point", 1, 4326], ["polyline", 1, 4326], ["polygon", 2, 4326]]);
  assert.deepEqual(layers[0].features[0].attributes, { name: "Showing 1", grade: "2.5" });
  assert.deepEqual(layers[0].features[0].parts, [[[-121.3, 52.2]]]);
  assert.equal(layers[2].features[0].parts.length, 2); // the hole
  assert.equal(layers[2].features[1].parts.length, 1);
  assert.equal(kmlToMapLayers([]).length, 0);
});
test("#1244 a NAD27 layer says how good its shift is; a NAD83 one has nothing to add", () => {
  const parsed = (epsg) => ({ epsg, geomType: "point", features: [{ parts: [[[500000, 5800000]]], attributes: {} }] });
  assert.match(buildLayer(parsed(26710), { sourceName: "n", projectEpsg: 26910 }).crsNote, /reprojected EPSG:26710 → EPSG:26910 ⚠ NAD27/);
  assert.equal(buildLayer(parsed(26909), { sourceName: "n", projectEpsg: 26910 }).crsNote, "reprojected EPSG:26909 → EPSG:26910");
});
test("#1200 Top is north up; #1221 the button says what it does; #1258, #1220 wrap", () => {
  const v = readFileSync("src/modules/ViewerModule.jsx", "utf8");
  assert.match(v, /camState\.current\.theta = 0; camState\.current\.phi = 0\.02;/);
  assert.match(readFileSync("src/components/Ribbon.jsx", "utf8"), /t\("Show all"\)/);
  assert.match(v, /flexWrap: "wrap", gap: 6, marginBottom: 8 \}\}>\{\/\* #1258/);
  assert.match(v, /flex: "1 0 40%", minWidth: 0 \}\} aria-label=\{tr\(ph\)\}/);
});
