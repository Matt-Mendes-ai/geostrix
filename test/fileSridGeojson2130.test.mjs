// TASKS.csv #2130 — Maps > A file: From comes from the table's own srid / epsg column when every row agrees, and a table can be saved
// as GeoJSON points (WGS 84)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sridColumnEpsg, rowsToGeoJSON } from "../src/lib/fileReproject.js";
import { pointTransform, reprojectXY } from "../src/lib/reproject.js";
const read = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");

test("#2130 the srid column", () => {
  const rows = [{ x: 1, srid_source: "26910", srid_output: "4326" }, { x: 2, srid_source: 26910, srid_output: "4326" }, { x: 3, srid_source: "", srid_output: "" }];
  assert.deepEqual(sridColumnEpsg(["x", "srid_source", "srid_output"], rows), { epsg: 26910, col: "srid_source" });
  assert.deepEqual(sridColumnEpsg(["EPSG"], [{ EPSG: "EPSG:28351" }]), { epsg: 28351, col: "EPSG" });
  assert.equal(sridColumnEpsg(["srid_source"], [{ srid_source: 26910 }, { srid_source: 26909 }]), null); // rows disagree
  assert.equal(sridColumnEpsg(["srid_output"], [{ srid_output: 4326 }]), null); // an output column is not the file's CRS
  assert.equal(sridColumnEpsg(["srid"], [{ srid: "abc" }]), null);
  assert.equal(sridColumnEpsg(["srid"], [{ srid: 999999 }]), null); // not a code GeoStrix knows
  assert.equal(sridColumnEpsg(["x"], [{ x: 1 }]), null);
});

test("#2130 rows to GeoJSON points in WGS 84", () => {
  // SYNTHETIC soil sites in UTM 10N
  const rows = [{ site: "S1", x: "640000", y: "5830000", Au_ppb: 12 }, { site: "S2", x: "641000", y: "5831000", Au_ppb: "" }, { site: "bad", x: "", y: "5831000" }, { site: "grid", x: "1200", y: "3400" }];
  const T = pointTransform(26910, 4326);
  const { geojson, points, bad } = rowsToGeoJSON(rows, { xCol: "x", yCol: "y", T, fromUtm: true });
  assert.equal(points, 2);
  assert.equal(bad, 2); // a blank X and a mine-grid pair
  const fc = JSON.parse(geojson);
  assert.equal(fc.type, "FeatureCollection");
  const ll = reprojectXY(640000, 5830000, 26910, 4326);
  assert.deepEqual(fc.features[0].geometry.coordinates, [+ll.x.toFixed(8), +ll.y.toFixed(8)]);
  assert.deepEqual(fc.features[0].properties, rows[0]);
  assert.ok(fc.features[0].geometry.coordinates[0] < -120 && fc.features[0].geometry.coordinates[1] > 52);
});

test("#2130 A file uses them", () => {
  const c = read("modules/CartographyModule.jsx");
  assert.match(c, /const srid = sridColumnEpsg\(t\.headers, t\.rows\);/);
  assert.match(c, /const implied = srid \? srid\.epsg : /);
  assert.match(c, /const T = pointTransform\(fileFrom, 4326\);/);
  assert.match(c, /onClick=\{saveGeoJSON\}/);
});
