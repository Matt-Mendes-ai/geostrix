// TASKS.csv #1063 / #1067 (review #1016) — GeoPackage export survives clashing column names and declares its geometry
// column's type; a NaN (blank / rejected dip) is NULL in a numeric column in both GeoPackage and shapefile; structure
// picks go out with named, north-referenced dip directions.
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./helpers/viteUrlLoader.mjs", import.meta.url);
import { buildShapefileZip, parseShapefileZip } from "../src/lib/shapefile.js";
import { structureGisAttributes } from "../src/lib/structureAttrs.js";
const { buildGeoPackage, parseGeoPackage } = await import("../src/lib/gpkg.js");

const features = [
  { geometry: [[500000, 6000000, 1000]], attributes: { "Mag (nT)": 51000, Mag_nT_: "a", Au: 1.5, AU: 2.5, fid: 7, GEOM: "x", dip: 45 } },
  { geometry: [[500010, 6000000, 1000]], attributes: { "Mag (nT)": 51010, Mag_nT_: "b", Au: 0.1, AU: 0.2, fid: 8, GEOM: "y", dip: NaN } },
];

test("#1063 clashing names no longer abort the export; every value comes back under its own column", async () => {
  const bytes = await buildGeoPackage([{ name: "pts", features, geomType: "point", epsg: 26910 }]);
  const { layers } = await parseGeoPackage(bytes);
  const a = layers[0].features[0].attributes;
  const vals = Object.values(a);
  for (const v of [51000, "a", 1.5, 2.5, 7, "x", 45]) assert.ok(vals.includes(v), `${v} in ${JSON.stringify(a)}`);
  assert.equal(new Set(Object.keys(a).map((k) => k.toLowerCase())).size, Object.keys(a).length, "no two names differ only by case");
});

test("#1063 the geometry column is declared POINT / LINESTRING / MULTIPOLYGON, not BLOB", async () => {
  const initSqlJs = (await import("sql.js")).default;
  const SQL = await initSqlJs();
  for (const [geomType, want, geometry] of [["point", "POINT", [[0, 0, 0]]], ["polyline", "LINESTRING", [[0, 0, 0], [1, 1, 0]]], ["polygon", "MULTIPOLYGON", [[0, 0, 0], [1, 0, 0], [1, 1, 0]]]]) {
    const db = new SQL.Database(await buildGeoPackage([{ name: "t", features: [{ geometry, attributes: { a: 1 } }], geomType, epsg: 26910 }]));
    const sql = db.exec("SELECT sql FROM sqlite_master WHERE name = 't'")[0].values[0][0];
    assert.match(sql, new RegExp(`geom ${want}`), sql);
    db.close();
  }
});

test("#1067 a NaN is NULL in a REAL column (GeoPackage) and blank in a numeric field (shapefile)", async () => {
  const { layers } = await parseGeoPackage(await buildGeoPackage([{ name: "pts", features, geomType: "point", epsg: 26910 }]));
  assert.equal(layers[0].features[0].attributes.dip, 45);
  assert.equal(layers[0].features[1].attributes.dip ?? null, null);
  const shp = await parseShapefileZip(buildShapefileZip({ features: features.map((f) => ({ ...f, attributes: { dip: f.attributes.dip } })), geomType: "point", epsg: 26910, baseName: "s" }));
  assert.equal(shp.features[0].attributes.DIP, 45);
  assert.ok(shp.features[1].attributes.DIP == null || Number.isNaN(shp.features[1].attributes.DIP) || shp.features[1].attributes.DIP === "", JSON.stringify(shp.features[1].attributes));
});

test("#1067 structure picks: type, dip, dipdir_grid, dipdir_true, strike_rhr", () => {
  const a = structureGisAttributes({ hole_id: "DH1", depth: 120, value: "BED", dip: 45, azimuth: 10, alpha: 30, _x: 1 }, 1.5);
  assert.deepEqual([a.type, a.dip, a.dipdir_grid, a.dipdir_true, a.strike_rhr], ["BED", 45, 10, 8.5, 280]);
  assert.ok(!("azimuth" in a) && !("_x" in a) && !("value" in a));
  const b = structureGisAttributes({ hole_id: "DH1", depth: 1, value: "FRAC", dip: NaN, azimuth: "" }, null);
  assert.equal(b.dip, null); assert.equal(b.dipdir_grid, null); assert.equal(b.dipdir_true, null);
});
