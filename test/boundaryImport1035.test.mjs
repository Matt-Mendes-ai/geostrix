// TASKS.csv #1035 (review #1016) — boundaries / claims from a shapefile or GeoPackage: the file's CRS is used and every ring kept.
import test from "node:test";
import assert from "node:assert/strict";
import { buildShapefileZip, parseShapefileZip } from "../src/lib/shapefile.js";
import { register } from "node:module";
register("./helpers/viteUrlLoader.mjs", import.meta.url); // gpkg.js imports sql.js's wasm with ?url
import { vectorToBoundaryPolylines } from "../src/lib/boundaryImport.js";
import { reprojectXY, getProj4Def } from "../src/lib/reproject.js";

// a BC Albers (EPSG:3005) claim block: one polygon with a hole, plus a second, separate part
const sq = (x, y, s) => [[x, y], [x, y + s], [x + s, y + s], [x + s, y], [x, y]];
const outer = sq(1000000, 1000000, 2000), hole = sq(1000500, 1000500, 500).reverse(), second = sq(1005000, 1000000, 1000);
const features = [{ geometry: outer, parts: [outer, hole, second], attributes: { tenure: "1081234" } }, { geometry: sq(1010000, 1000000, 800), attributes: { tenure: "1081235" } }];

test("#1035 shapefile in EPSG:3005 into a 26910 project: all 4 rings, each vertex reprojected, closed, and the note says so", async () => {
  await getProj4Def(3005);
  const zip = buildShapefileZip({ features, geomType: "polygon", epsg: 3005, baseName: "claims" });
  const parsed = await parseShapefileZip(zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength));
  const r = await vectorToBoundaryPolylines(parsed, 26910);
  assert.equal(r.sourceEpsg, 3005);
  assert.equal(r.polylines.length, 4, "outer + hole + second part + second feature");
  assert.deepEqual(r.closedFlags, [true, true, true, true]);
  assert.match(r.note, /reprojected from EPSG:3005 to EPSG:26910/);
  const want = reprojectXY(1000000, 1000000, 3005, 26910);
  const all = r.polylines.flat();
  assert.ok(all.some((p) => Math.abs(p.x - want.x) < 0.01 && Math.abs(p.y - want.y) < 0.01), "the outer ring's corner, reprojected");
  assert.ok(all.every((p) => p.x > 100000 && p.x < 900000), "UTM eastings, not Albers metres");
});

test("#1035 GeoPackage layer: srs_id used; same project CRS: untouched, no note; no CRS stated: kept and the note says it was assumed", async () => {
  const { buildGeoPackage, parseGeoPackage } = await import("../src/lib/gpkg.js");
  const bytes = await buildGeoPackage([{ name: "claims", features, geomType: "polygon", epsg: 3005 }]);
  const { layers } = await parseGeoPackage(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const g = await vectorToBoundaryPolylines(layers[0], 26910);
  assert.equal(g.sourceEpsg, 3005); assert.ok(g.polylines.length >= 3);
  assert.ok(g.polylines.flat().every((p) => p.x > 100000 && p.x < 900000));
  const same = await vectorToBoundaryPolylines({ features, geomType: "polygon", epsg: 26910 }, 26910);
  assert.equal(same.note, null); assert.equal(same.polylines[0][0].x, 1000000);
  const none = await vectorToBoundaryPolylines({ features, geomType: "polyline" }, 26910);
  assert.match(none.note, /states no CRS/); assert.deepEqual(none.closedFlags, [false, false, false, false]);
});
