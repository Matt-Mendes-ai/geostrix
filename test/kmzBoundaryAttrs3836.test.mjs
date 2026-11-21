// TASKS.csv #3883 (#3836) — the project KMZ: a claim's tenure number, status, good-to date and area, and an imported boundary's own attributes (one placemark
// per feature of its file), in each placemark's ExtendedData and (a claim) description. SYNTHETIC claims and boundaries.
import test from "node:test";
import assert from "node:assert/strict";
import { buildProjectKml } from "../src/lib/projectKmz.js";
import { boundaryPlacemarkFeatures } from "../src/lib/overlayExport.js";

const toLonLat = (x, y) => [-130 + (x - 500000) / 1e5, 56 + (y - 6200000) / 1e5];
const sq = (x, y, s) => [{ x, y }, { x: x + s, y }, { x: x + s, y: y + s }, { x, y: y + s }];
const claim = { name: "Claim 1234567", kind: "claim", tenureNumber: "1234567", status: "active", expiryDate: "2027-03-01", polylines: [sq(500000, 6200000, 500)], visible: true };
const districts = { name: "Districts", polylines: [sq(500000, 6201000, 300), sq(501000, 6201000, 300), sq(501050, 6201050, 50)], featureOf: [0, 1, 1], partNames: ["North", "South", "South"],
  attributes: [{ district: "North", code: 11, owner: "Example Ltd.", note: null }, { district: "South", code: 12, owner: "", started: new Date(Date.UTC(2020, 0, 15)) }], visible: true };

test("#3836 the placemarks of a boundary: one per feature of its file with that feature's attributes; a claim's tenure fields and area", () => {
  const c = boundaryPlacemarkFeatures(claim, { areaHa: 25 });
  assert.equal(c.features.length, 1);
  assert.deepEqual(c.features[0].attributes, { name: "Claim 1234567", kind: "claim", tenure_number: "1234567", status: "active", expiry_date: "2027-03-01", area_ha: 25 });
  assert.equal(c.description(c.features[0]), "Tenure 1234567 · status active · good to 2027-03-01 · 25 ha");
  const d = boundaryPlacemarkFeatures(districts);
  assert.equal(d.geomType, "polygon");
  assert.deepEqual(d.features.map((f) => [f.name, f.parts.length]), [["North", 1], ["South", 2]], "the hole stays a ring of its feature");
  assert.deepEqual(d.features[0].attributes, { district: "North", code: 11, owner: "Example Ltd.", name: "Districts", kind: "boundary" }, "empty values left out");
  assert.equal(d.features[1].attributes.started, "2020-01-15");
  assert.equal(d.description(d.features[0]), "");
  // no per-feature attributes: one placemark as before
  const plain = boundaryPlacemarkFeatures({ name: "Outline", polylines: [sq(0, 0, 10)] });
  assert.equal(plain.features.length, 1); assert.equal(plain.features[0].name, "Outline");
});

test("#3836 in the KMZ: ExtendedData and the claim's description; the area only in a projected metric CRS", () => {
  const ctx = (epsg) => ({ projectName: "Synthetic", epsg, collars: [], survey: [], layers: {}, customLayers: [], assays: [], assayElements: [], surfaceSamples: [], surfaceStructures: [], mapLayers: [], boundaries: [claim, districts], plannedHoles: [], sections: [], rasters: [], layerGroups: {}, ui: {} });
  const opts = { toLonLat, legendPng: () => ({ bytes: new Uint8Array([137, 80, 78, 71]), width: 1, height: 1 }) };
  const { kml } = buildProjectKml(ctx(32609), opts);
  const pm = (name) => { const i = kml.indexOf(`<Placemark><name>${name}</name>`); assert.ok(i >= 0, name); return kml.slice(i, kml.indexOf("</Placemark>", i)); };
  const c = pm("Claim 1234567");
  assert.match(c, /<description>Tenure 1234567 · status active · good to 2027-03-01 · 25 ha<\/description>/);
  for (const [k, v] of [["tenure_number", "1234567"], ["status", "active"], ["expiry_date", "2027-03-01"], ["area_ha", "25"]]) assert.match(c, new RegExp(`<Data name="${k}"><value>${v}</value></Data>`));
  assert.match(pm("North"), /<Data name="owner"><value>Example Ltd\.<\/value><\/Data>/);
  assert.match(pm("South"), /<Data name="district"><value>South<\/value><\/Data>/);
  const geo = buildProjectKml(ctx(4326), opts).kml;
  assert.ok(!/area_ha/.test(geo), "no area from degrees");
});
