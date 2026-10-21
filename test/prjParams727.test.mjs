// TASKS.csv #727 — a .prj name match is cross-checked against the projection's parameters and linear unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { guessEpsgFromPrjWkt, prjParamsMismatch } from "../src/lib/reproject.js";

// what ArcGIS writes for NAD 1983 UTM zone 10N (no AUTHORITY clause)
const ESRI_UTM10 = 'PROJCS["NAD_1983_UTM_Zone_10N",GEOGCS["GCS_North_American_1983",DATUM["D_North_American_1983",SPHEROID["GRS_1980",6378137.0,298.257222101]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",500000.0],PARAMETER["False_Northing",0.0],PARAMETER["Central_Meridian",-123.0],PARAMETER["Scale_Factor",0.9996],PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0]]';
const ESRI_BC_ALBERS = 'PROJCS["NAD_1983_BC_Environment_Albers",GEOGCS["GCS_North_American_1983",DATUM["D_North_American_1983",SPHEROID["GRS_1980",6378137.0,298.257222101]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Albers"],PARAMETER["False_Easting",1000000.0],PARAMETER["False_Northing",0.0],PARAMETER["Central_Meridian",-126.0],PARAMETER["Standard_Parallel_1",50.0],PARAMETER["Standard_Parallel_2",58.5],PARAMETER["Latitude_Of_Origin",45.0],UNIT["Meter",1.0]]';

test("#727 a name whose parameters agree is still recognised", () => {
  assert.equal(guessEpsgFromPrjWkt(ESRI_UTM10), 26910);
  assert.equal(guessEpsgFromPrjWkt(ESRI_BC_ALBERS), 3005);
  assert.equal(prjParamsMismatch(ESRI_UTM10, 26910), null);
});

test("#727 a name contradicted by its own parameters or unit is refused, with the reason", () => {
  const zone9meridian = ESRI_UTM10.replace("-123.0", "-129.0");
  assert.equal(guessEpsgFromPrjWkt(zone9meridian), null);
  assert.match(prjParamsMismatch(zone9meridian, 26910), /Central_Meridian/i);
  const usFeet = ESRI_UTM10.replace('UNIT["Meter",1.0]]', 'UNIT["Foot_US",0.3048006096012192]]').replace("500000.0", "1640416.6667");
  assert.equal(guessEpsgFromPrjWkt(usFeet), null);
  assert.match(prjParamsMismatch(usFeet, 26910), /linear unit/);
  const notTm = ESRI_UTM10.replace("Transverse_Mercator", "Lambert_Conformal_Conic");
  assert.equal(guessEpsgFromPrjWkt(notTm), null);
  const albersShifted = ESRI_BC_ALBERS.replace('"Standard_Parallel_2",58.5', '"Standard_Parallel_2",60.0');
  assert.equal(guessEpsgFromPrjWkt(albersShifted), null);
});

test("#727 an explicit EPSG authority still wins (#419)", () => {
  const withAuth = ESRI_UTM10.replace(/\]$/, ',AUTHORITY["EPSG","26910"]]');
  assert.equal(guessEpsgFromPrjWkt(withAuth), 26910);
});
