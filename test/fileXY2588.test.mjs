// TASKS.csv #2588 — Maps > Coordinates > A file opened the company collar file on its mine-grid columns (GBMG_East / GBMG_North) and
// would have written 7,307.62 under GBMG_East_EPSG28350 with 0 bad rows; MGA_E / MGA_N alone were not recognized at all
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileXYColumns, fromForGridPrefix, utmOutOfRange, isUtmCrs, reprojectTableRows } from "../src/lib/fileReproject.js";
import { pointTransform } from "../src/lib/reproject.js";

const COLLAR_HEADERS = ["Hole_id", "MGA_E", "MGA_N", "MGA_Z", "Max_Depth", "Dip", "Azimuth", "GBMG_East", "GBMG_North", "GBMG_RL"];

test("the map-grid pair is picked before the mine grid's, and alone it is recognized", () => {
  assert.deepEqual(fileXYColumns(COLLAR_HEADERS), { x: "MGA_E", y: "MGA_N", prefix: "mga", geographic: false });
  assert.deepEqual(fileXYColumns(["Hole_id", "MGA_E", "MGA_N", "MGA_Z"]), { x: "MGA_E", y: "MGA_N", prefix: "mga", geographic: false });
  // a plain easting / longitude still wins; a mine grid alone is still offered (the range check below guards it)
  assert.equal(fileXYColumns(["id", "Easting", "Northing", "GBMG_East", "GBMG_North"]).x, "Easting");
  assert.deepEqual(fileXYColumns(["lon", "lat", "value"]), { x: "lon", y: "lat", prefix: null, geographic: true });
  assert.equal(fileXYColumns(["Hole", "GBMG_East", "GBMG_North"]).x, "GBMG_East");
});

test("From follows the column names only when they name the project's own CRS family", () => {
  assert.equal(fromForGridPrefix("mga", 28350), 28350); // MGA_ on GDA94 / MGA 50
  assert.equal(fromForGridPrefix("mga", 7850), 7850); // and on GDA2020 / MGA 50
  assert.equal(fromForGridPrefix("gda94", 28350), 28350);
  assert.equal(fromForGridPrefix("gda94", 7850), null); // the names say GDA94, the project is GDA2020
  assert.equal(fromForGridPrefix("mga2020", 28350), null);
  assert.equal(fromForGridPrefix("mga", 3156), null); // a UTM project: say nothing
  assert.equal(fromForGridPrefix("utm", 3156), 3156);
  assert.equal(fromForGridPrefix("gbmg", 28350), null);
  assert.equal(fromForGridPrefix(null, 28350), null);
  assert.equal(fromForGridPrefix("mga", null), null);
});

test("mine-grid numbers under a UTM / MGA From are counted before Save and left blank, never stamped", () => {
  const rows = [
    { Hole_id: "GBAC1182", MGA_E: "411899.640", MGA_N: "6249475.921", GBMG_East: "7307.62", GBMG_North: "9185.655" },
    { Hole_id: "B", MGA_E: "414000", MGA_N: "6251000", GBMG_East: "9500", GBMG_North: "10700" },
    { Hole_id: "C", MGA_E: "", MGA_N: "", GBMG_East: "", GBMG_North: "" },
  ];
  assert.equal(isUtmCrs(28350), true);
  assert.equal(isUtmCrs(7850), true);
  assert.equal(isUtmCrs(4326), false);
  assert.equal(isUtmCrs(3005), false); // BC Albers: its own ranges, not checked here
  assert.deepEqual(utmOutOfRange(rows, "GBMG_East", "GBMG_North"), { checked: 2, outside: 2, example: [7307.62, 9185.655] });
  assert.deepEqual(utmOutOfRange(rows, "MGA_E", "MGA_N"), { checked: 2, outside: 0, example: null });
  const T = pointTransform(7850, 28350);
  const bad = reprojectTableRows(rows, { xCol: "GBMG_East", yCol: "GBMG_North", xName: "X", yName: "Y", T, geographic: false, fromUtm: true });
  assert.equal(bad.bad, 3);
  assert.equal(bad.rows[0].X, "");
  const ok = reprojectTableRows(rows, { xCol: "MGA_E", yCol: "MGA_N", xName: "X", yName: "Y", T, geographic: false, fromUtm: true });
  assert.equal(ok.bad, 1); // only the blank row
  assert.ok(Math.abs(ok.rows[0].X - 411899.64) < 3, String(ok.rows[0].X)); // GDA2020 -> GDA94: about 1.5 m
});

test("the pane uses the grid-aware guess, warns and holds Save", () => {
  const src = readFileSync(new URL("../src/modules/CartographyModule.jsx", import.meta.url), "utf8");
  assert.match(src, /const g = fileXYColumns\(t\.headers\);/);
  assert.match(src, /fromForGridPrefix\(g\.prefix, project\?\.crsSet !== false \? project\?\.epsg : null\)/);
  assert.match(src, /\(fromUtm && fromUtm\.outside > fromUtm\.checked \/ 2\)\} onClick=\{saveReprojected\}/);
  assert.match(src, /fromUtm: isUtmCrs\(fileFrom\) \}\);/);
});
