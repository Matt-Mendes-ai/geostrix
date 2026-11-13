// TASKS.csv #3128 (found building the Central Lapland sample, #3107) — Finland's EPSG:3067 (TM35FIN) and Sweden's EPSG:3006 (SWEREF99 TM) are
// known before the full EPSG registry loads (it is a 1.2 MB chunk loaded on demand), with the registry's own definitions, and a .prj that names
// them the ESRI / QGIS way (no EPSG code in the file) is recognized, its parameters still checked.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as R from "../src/lib/reproject.js";

const esri = (name, datum, cm) => `PROJCS["${name}",GEOGCS["GCS_${datum}",DATUM["D_${datum}",SPHEROID["GRS_1980",6378137.0,298.257222101]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",500000.0],PARAMETER["False_Northing",0.0],PARAMETER["Central_Meridian",${cm}],PARAMETER["Scale_Factor",0.9996],PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0]]`;

test("before the registry loads: 3067 and 3006 are defined, named and listed", () => {
  assert.equal(R.epsgRegistryLoaded(), false);
  assert.equal(R.crsName(3067), "EUREF-FIN / TM35FIN(E,N)");
  assert.equal(R.crsName(3006), "SWEREF99 TM");
  assert.ok(R.listSupportedCrs().some((c) => c.code === 3067) && R.listSupportedCrs().some((c) => c.code === 3006));
  assert.equal(R.isMetricProjectedEpsg(3067), true);
  // TM35FIN is UTM zone 35 over the whole of Finland: the same numbers as ETRS89 / UTM 35N (the code the sample had to use)
  assert.deepEqual(R.reprojectXY(450000, 7500000, 3067, 4326), R.reprojectXY(450000, 7500000, 25835, 4326));
  // a point at the central meridian of each: 27 E and 15 E, at the false easting
  const f = R.reprojectXY(500000, 7000000, 3067, 4326), s = R.reprojectXY(500000, 6600000, 3006, 4326);
  assert.ok(Math.abs(f.x - 27) < 1e-9 && Math.abs(s.x - 15) < 1e-9);
  assert.ok(f.y > 63.1 && f.y < 63.2 && s.y > 59.5 && s.y < 59.6); // 7,000 km and 6,600 km north of the equator
});

test("the hand definitions are the registry's own (EPSG v12.029 via PROJ 9.8.1)", () => {
  const reg = JSON.parse(readFileSync(new URL("../src/lib/epsgRegistry.json", import.meta.url), "utf8"));
  for (const code of [3067, 3006]) {
    const [, def] = reg.codes[String(code)];
    const a = R.getProj4DefSync(code);
    for (const k of ["+proj=utm", "+zone=", "+units=m"]) assert.ok(a.includes(k) && def.includes(k), `${code} ${k}`);
    assert.equal(/\+zone=(\d+)/.exec(a)[1], /\+zone=(\d+)/.exec(def)[1], `${code} zone`);
    assert.match(a, /\+towgs84=0,0,0,0,0,0,0/); assert.match(def, /\+towgs84=0,0,0,0,0,0,0/);
  }
});

test("a .prj named the ESRI / QGIS way, with no EPSG code: recognized, and refused when a parameter is off", () => {
  assert.equal(R.guessEpsgFromPrjWkt(esri("ETRS89_TM35FIN_E_N", "ETRS_1989", 27)), 3067);
  assert.equal(R.guessEpsgFromPrjWkt(esri("ETRS_1989_TM35FIN_E_N", "ETRS_1989", 27)), 3067);
  assert.equal(R.guessEpsgFromPrjWkt(esri("SWEREF99_TM", "SWEREF99", 15)), 3006);
  assert.equal(R.guessEpsgFromPrjWkt(esri("ETRS89_TM35FIN_E_N", "ETRS_1989", 24)), null);
  assert.match(R.prjRefusal(esri("ETRS89_TM35FIN_E_N", "ETRS_1989", 24)), /CENTRAL_MERIDIAN 24 vs 27/);
  // a SWEREF99 local zone is not SWEREF99 TM
  assert.equal(R.guessEpsgFromPrjWkt(esri("SWEREF99_18_00", "SWEREF99", 18)), null);
  // with its EPSG code, as before
  assert.equal(R.guessEpsgFromPrjWkt(esri("ETRS89 / TM35FIN(E,N)", "ETRS_1989", 27).replace(/\]$/, ',AUTHORITY["EPSG","3067"]]')), 3067);
});

test("a shapefile exported in 3067 / 3006 gets a .prj under ArcGIS's own names, read back to the same code; other EUREF-FIN / SWEREF99 grids keep their EPSG code", async () => {
  const { prjWktFor } = await import("../src/lib/shapefile.js");
  const fin = prjWktFor(3067), swe = prjWktFor(3006);
  assert.match(fin, /^PROJCS\["ETRS_1989_TM35FIN_E_N",GEOGCS\["GCS_ETRS_1989",DATUM\["D_ETRS_1989",SPHEROID\["GRS_1980",6378137\.0,298\.257222101\]\]/);
  assert.match(fin, /PARAMETER\["Central_Meridian",27\.0\],PARAMETER\["Scale_Factor",0\.9996\]/);
  assert.match(swe, /^PROJCS\["SWEREF99_TM",GEOGCS\["GCS_SWEREF99",DATUM\["D_SWEREF99"/);
  assert.match(swe, /PARAMETER\["Central_Meridian",15\.0\]/);
  assert.equal(R.guessEpsgFromPrjWkt(fin), 3067);
  assert.equal(R.guessEpsgFromPrjWkt(swe), 3006);
  // a grid only the full registry has (SWEREF99 18 00): the generic WKT with its EPSG code, as before
  R.installEpsgRegistry(JSON.parse(readFileSync(new URL("../src/lib/epsgRegistry.json", import.meta.url), "utf8")));
  const local = prjWktFor(3011);
  assert.match(local, /AUTHORITY\["EPSG","3011"\]\]$/);
  assert.equal(R.guessEpsgFromPrjWkt(local), 3011);
});
