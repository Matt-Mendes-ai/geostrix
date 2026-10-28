// TASKS.csv #1062 (review #1016) — a .prj for (almost) every projected registry code, in the right linear unit.
// (Checked once against GDAL: 4,956 of the 5,158 written agree with GDAL's own EPSG definition to under 5 cm, 0 differ;
// the other 202 are codes newer than the GDAL used.)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { installEpsgRegistry } from "../src/lib/reproject.js";
import { prjWktFor } from "../src/lib/shapefile.js";

installEpsgRegistry(JSON.parse(readFileSync(new URL("../src/lib/epsgRegistry.json", import.meta.url), "utf8")));
const param = (w, k) => Number(new RegExp(String.raw`PARAMETER\["${k}",([-\d.e]+)\]`, "i").exec(w)?.[1]);

test("#1062 NAD83(2011) / UTM 10N and other registry codes get a .prj that names its EPSG code", () => {
  for (const c of [6339, 2955, 3005, 26910, 31370]) {
    const w = prjWktFor(c);
    assert.ok(w && w.startsWith("PROJCS["), `${c}: ${w}`);
  }
  assert.match(prjWktFor(6339), /AUTHORITY\["EPSG","6339"\]/);
  assert.match(prjWktFor(6339), /TOWGS84\[/);
});

test("#1062 US-foot codes: the unit is the US survey foot and the false easting is in feet (was metres, 3.28x off)", () => {
  for (const c of [2240, 32664, 8035]) {
    const w = prjWktFor(c);
    assert.match(w, /UNIT\["US survey foot",0\.304800609601219\],AUTHORITY/, String(c));
    assert.ok(!/UNIT\["Meter",1\.0\]\]$/.test(w));
  }
  assert.ok(Math.abs(param(prjWktFor(2240), "false_easting") - 2296583.333) < 0.01); // 699,999.9999 m
  assert.ok(Math.abs(param(prjWktFor(32664), "false_easting") - 1640416.667) < 0.01);
});

test("#1062 cases WKT1 cannot carry exactly keep the READ_ME (no .prj)", () => {
  for (const c of [3408, 3411, 32661, 3993, 6201]) assert.equal(prjWktFor(c), null, String(c)); // sphere, polar stereo, UPS, Guam, Lambert 2SP with scale
  assert.ok(prjWktFor(26910).includes("NAD_1983_UTM_Zone_10N"), "the ESRI templates are unchanged where they apply");
});
