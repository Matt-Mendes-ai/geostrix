// TASKS.csv #1025 (review #1016) — map layers, boundaries, surface samples and outcrop structures leave GeoStrix as
// shapefile / GeoPackage / DXF / KML / CSV; the shapefile polygon writer follows the ring-winding rule.
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./helpers/viteUrlLoader.mjs", import.meta.url); // gpkg.js imports sql.js's wasm with ?url
import { buildShapefileZip, parseShapefileZip } from "../src/lib/shapefile.js";
import { shapefileRings, signedRingArea, polygonsFromRings } from "../src/lib/polygonRings.js";
import { mapLayerFeatures, boundaryFeatures, surfaceSampleRows, surfaceSampleFeatures, surfaceStructureRows, featuresToKml, lonLatTransform, explodeParts, kmlColor, mapLayerColorOf } from "../src/lib/overlayExport.js";
import { anomalyClasses } from "../src/lib/anomalyMap.js";
import { buildDXF } from "../src/lib/dxf.js";
const { buildGeoPackage, parseGeoPackage } = await import("../src/lib/gpkg.js");

const sq = (x, y, s) => [[x, y], [x + s, y], [x + s, y + s], [x, y + s]]; // counter-clockwise, open
const area = (rings) => polygonsFromRings(rings).reduce((s, [o, ...h]) => s + Math.abs(signedRingArea(o)) - h.reduce((a, r) => a + Math.abs(signedRingArea(r)), 0), 0);

test("#1025 shapefile rings: outer clockwise, holes counter-clockwise, closed — whatever winding they came in", () => {
  const outer = sq(0, 0, 100), hole = sq(20, 20, 10).reverse(), second = sq(300, 0, 50).reverse();
  const rs = shapefileRings([hole, outer, second]); // the hole first and an already-clockwise second part
  assert.equal(rs.length, 3);
  rs.forEach((r) => assert.deepEqual(r[0], r[r.length - 1]));
  const outers = rs.filter((r) => signedRingArea(r) < 0), holes = rs.filter((r) => signedRingArea(r) > 0);
  assert.equal(outers.length, 2); assert.equal(holes.length, 1);
  assert.equal(Math.abs(signedRingArea(holes[0])), 100);
  assert.ok(rs.indexOf(holes[0]) === rs.findIndex((r) => Math.abs(signedRingArea(r)) === 10000) + 1, "a hole follows its outer ring");
});

test("#1025 polygon shapefile round trip keeps the area (a counter-clockwise outer was read as a hole before)", async () => {
  const outer = sq(500000, 6000000, 1000), hole = sq(500200, 6000200, 100); // both counter-clockwise, as from a TAB
  const zip = buildShapefileZip({ features: [{ geometry: outer, parts: [outer, hole], attributes: { unit: "Ka" } }], geomType: "polygon", epsg: 26910, baseName: "geo", keepFieldCase: true });
  const back = await parseShapefileZip(zip);
  const parts = back.features[0].parts;
  assert.equal(parts.length, 2);
  assert.ok(signedRingArea(parts[0]) < 0, "outer clockwise");
  assert.ok(signedRingArea(parts[1]) > 0, "hole counter-clockwise");
  assert.equal(area(parts), 1000 * 1000 - 100 * 100);
  assert.equal(back.features[0].attributes.unit, "Ka");
});

const geology = { name: "Geology", geomType: "polygon", styleField: "unit", categories: [{ value: "Ka", color: "#ff8800" }], features: [{ parts: [sq(500000, 6000000, 1000), sq(500200, 6000200, 100)], attributes: { unit: "Ka", age: "Cretaceous" } }, { parts: [sq(502000, 6000000, 500)], attributes: { unit: "Tv" } }] };
const contacts = { name: "Contacts", geomType: "polyline", features: [{ parts: [[[500000, 6000000], [500100, 6000100]], [[500200, 6000200], [500300, 6000250], [500400, 6000260]]], attributes: { type: "fault" } }] };

test("#1025 map layers: every ring and part and attribute to GeoPackage (polygons, multi-part lines) and shapefile", async () => {
  const g = mapLayerFeatures(geology), c = mapLayerFeatures(contacts);
  assert.equal(g.geomType, "polygon"); assert.equal(c.geomType, "polyline");
  const bytes = await buildGeoPackage([{ name: "geology", ...g, epsg: 26910 }, { name: "contacts", ...c, epsg: 26910 }]);
  const { layers } = await parseGeoPackage(bytes);
  const lg = layers.find((l) => l.name === "geology"), lc = layers.find((l) => l.name === "contacts");
  assert.equal(lg.features.length, 2);
  assert.equal(lg.features[0].parts.length, 2); // outer + hole
  assert.equal(lg.features[0].attributes.age, "Cretaceous");
  assert.equal(lc.features.length, 1);
  assert.equal(lc.features[0].parts.length, 2, "both pieces of the contact (a MultiLineString)");
  assert.equal(lc.features[0].parts[1].length, 3);
  const shp = await parseShapefileZip(buildShapefileZip({ ...c, epsg: 26910, baseName: "contacts" }));
  assert.equal(shp.features[0].parts.length, 2);
  // multi-point features: one point each
  const pts = mapLayerFeatures({ geomType: "point", features: [{ parts: [[[1, 2]], [[3, 4]]], attributes: { id: "a" } }] });
  assert.equal(pts.features.length, 2); assert.deepEqual(pts.features[1].geometry[0].slice(0, 2), [3, 4]);
  // DXF: one entity per part, closed polylines for rings
  const dxf = buildDXF(explodeParts(g));
  assert.equal((dxf.match(/\nPOLYLINE\n/g) || []).length, 3);
  assert.equal(mapLayerColorOf(geology)(geology.features[0]), "#ff8800");
});

test("#1025 boundaries: closed loops are a polygon with every ring, open lines a multi-part line", () => {
  const b = { name: "Claims", kind: "claim", elevation: 1200, polylines: [sq(0, 0, 100).map(([x, y]) => ({ x, y })), sq(200, 0, 50).map(([x, y]) => ({ x, y }))] };
  const f = boundaryFeatures(b);
  assert.equal(f.geomType, "polygon"); assert.equal(f.features[0].parts.length, 2);
  assert.deepEqual(f.features[0].attributes, { name: "Claims", kind: "claim" });
  assert.equal(f.features[0].parts[0][0][2], 1200);
  const open = boundaryFeatures({ ...b, closedFlags: [false, true] });
  assert.equal(open.geomType, "polyline");
  assert.equal(boundaryFeatures({ name: "x", polylines: [] }).features.length, 0);
});

const units = { Cu: "ppm", Au: "ppb" };
const samples = [
  { sample_id: "S1", x: 500000, y: 6000000, z: 1000, medium: "soil", values: { Cu: 40, Au: 5 }, attrs: { domain: "A" } },
  { sample_id: "S2", x: 500050, y: 6000000, z: null, medium: "soil", values: { Cu: 400 }, bdl: ["Au"] },
  { sample_id: "S3", x: 500100, y: 6000000, z: 1001, medium: "soil", values: { Cu: 45, Au: 2 } },
];

test("#1025 surface samples: every element with its unit, detection flags, own columns and the anomaly class", () => {
  const elements = [{ symbol: "Cu", unit: "ppm" }, { symbol: "Au", unit: "ppb" }];
  const drawn = samples.map((s) => (Number.isFinite(s.z) ? s : { ...s, z: 999, zDraped: true })); // a draped copy, as in the 3D view
  const result = { classOf: Int8Array.from([0, 2, 0]), classes: [{ label: "low" }, { label: "mid" }, { label: "high" }], anomalousFrom: 2 };
  const rows = surfaceSampleRows(samples, elements, { result, drawn });
  assert.deepEqual(Object.keys(rows[0]).slice(0, 7), ["sample_id", "medium", "x", "y", "z", "Cu_ppm", "Au_ppb"]);
  assert.equal(rows[0].Au_ppb, 5); assert.equal(rows[1].Au_ppb, ""); assert.equal(rows[1].below_detection, "Au");
  assert.equal(rows[0].domain, "A");
  assert.equal(rows[1].z, ""); // no elevation of its own: not made up
  assert.equal(rows[1].anomaly_class, "high"); assert.equal(rows[1].anomalous, "yes"); assert.equal(rows[0].anomalous, "");
  const f = surfaceSampleFeatures(samples, elements);
  assert.equal(f.geomType, "point"); assert.equal(f.features.length, 3);
  assert.equal(f.features[0].attributes.Cu_ppm, 40); assert.ok(!("x" in f.features[0].attributes));
});

test("#1025 the anomaly result carries the value each sample was classified on (anomaly_classes.csv)", () => {
  const a = anomalyClasses(samples, { mode: "element", symbol: "Cu", scheme: "percentile", groupBy: "none" }, { units });
  assert.equal(a.valueName, "Cu_ppm");
  assert.deepEqual([...a.values], [40, 400, 45]);
  const au = anomalyClasses(samples, { mode: "element", symbol: "Au", scheme: "percentile", groupBy: "none" }, { units });
  assert.equal(au.valueName, "Au_ppb"); assert.ok(Number.isNaN(au.values[1]));
});

test("#1025 outcrop structures: dip, dip direction and RHR strike in grid and true north", () => {
  const set = { rows: [{ x: 600000, y: 5600000, z: null, dip: 60, dipDir: 90, cls: "bedding", type: "S0" }, { x: 600000, y: 5600000, dip: 30, dipDir: 10, cls: "fault" }] };
  const rows = surfaceStructureRows(set, 32610);
  assert.equal(rows[0].dipdir_grid, 90); assert.equal(rows[0].strike_rhr_grid, 0); assert.equal(rows[1].strike_rhr_grid, 280);
  assert.equal(rows[0].z, "");
  // east of the UTM 10 central meridian (-123°) grid north is east of true north, so a true bearing is larger than grid
  assert.ok(rows[0].dipdir_true > 90 && rows[0].dipdir_true < 92, String(rows[0].dipdir_true));
  assert.ok(Math.abs(rows[0].strike_rhr_true - (rows[0].dipdir_true - 90)) < 0.11);
  assert.equal(surfaceStructureRows(set, null)[0].dipdir_true, "");
});

test("#1025 KML: lon / lat, polygons with holes, multi-part lines, colours and a strike heading", async () => {
  const toLonLat = await lonLatTransform(26910);
  const kml = featuresToKml(mapLayerFeatures(geology), { name: "Geology", toLonLat, colorOf: mapLayerColorOf(geology), nameOf: (f) => f.attributes.unit });
  assert.equal((kml.match(/<Placemark>/g) || []).length, 2);
  assert.equal((kml.match(/<innerBoundaryIs>/g) || []).length, 1);
  assert.match(kml, /<Data name="age"><value>Cretaceous<\/value><\/Data>/);
  assert.match(kml, new RegExp(`<color>${kmlColor("#ff8800")}</color>`));
  const lon = Number(/<coordinates>(-?[\d.]+),(-?[\d.]+)/.exec(kml)[1]), lat = Number(/<coordinates>(-?[\d.]+),(-?[\d.]+)/.exec(kml)[2]);
  assert.ok(lon > -124 && lon < -122 && lat > 54 && lat < 55, `${lon} ${lat}`);
  const lines = featuresToKml(mapLayerFeatures(contacts), { toLonLat });
  assert.equal((lines.match(/<LineString>/g) || []).length, 2); assert.match(lines, /<MultiGeometry>/);
  const pts = featuresToKml({ geomType: "point", features: [{ geometry: [[500000, 6000000, 0]], attributes: { dip: 60 } }] }, { toLonLat, headingOf: () => 45, nameOf: () => "60° <&>" });
  assert.match(pts, /<heading>45<\/heading>/); assert.match(pts, /60° &lt;&amp;&gt;/);
  assert.equal(kmlColor("#112233", 1), "ff332211");
});
