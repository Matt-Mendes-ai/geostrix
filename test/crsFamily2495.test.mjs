// TASKS.csv #2495 (review #2486, WA lithium) — collar columns named MGA_E / MGA_N: the CRS question lists the MGA zones (GDA94 and
// GDA2020, 49-56) with where the collars would land in each, instead of "A collar CSV doesn't say which CRS it is in"
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { crsFamilyFromColumns, epsgFromColumns } from "../src/lib/crsFromColumns.js";
import { collarCentreLonLat } from "../src/lib/projectCrs.js";

test("an MGA prefix with no zone: both datums, zones 49-56; the review's file (MGA_ and GBMG_ triples)", () => {
  const f = crsFamilyFromColumns(["Hole_ID", "MGA_E", "MGA_N", "MGA_Z", "GBMG_East", "GBMG_North", "GBMG_RL"]);
  assert.equal(f.grid, "MGA");
  assert.deepEqual(f.cols, ["MGA_E", "MGA_N", "MGA_Z"]);
  assert.deepEqual(f.datums, ["GDA2020", "GDA94"]);
  assert.equal(f.zone, null);
  assert.equal(f.codes.length, 16);
  assert.ok(f.codes.includes(28350) && f.codes.includes(7850) && f.codes.includes(28349) && f.codes.includes(7856));
  assert.equal(epsgFromColumns(["MGA_E", "MGA_N"]), null); // the old detector named nothing
});

test("the datum and zone when the header names them", () => {
  assert.deepEqual(crsFamilyFromColumns(["MGA94_East", "MGA94_North"]).codes, [28349, 28350, 28351, 28352, 28353, 28354, 28355, 28356]);
  assert.deepEqual(crsFamilyFromColumns(["Easting_GDA2020", "Northing_GDA2020"]).datums, ["GDA2020"]);
  assert.deepEqual(crsFamilyFromColumns(["MGA94_50_E", "MGA94_50_N"]).codes, [28350]); // one code: chosen like a named CRS
  assert.deepEqual(crsFamilyFromColumns(["MGA_Z51_E", "MGA_Z51_N"]).codes, [7851, 28351]);
  assert.deepEqual(crsFamilyFromColumns(["AMG84_E", "AMG84_N"]).codes.slice(0, 2), [20349, 20350]);
  assert.deepEqual(crsFamilyFromColumns(["AMG_E", "AMG_N"]).datums, ["AGD84", "AGD66"]);
  assert.deepEqual(crsFamilyFromColumns(["MGA_E", "MGA94_N"]).datums, ["GDA94"]); // the columns agree on what both allow
});

test("no family: plain X / Y, two families, a zone outside 49-56, a zone column", () => {
  assert.equal(crsFamilyFromColumns(["X", "Y"]), null);
  assert.equal(crsFamilyFromColumns(["MGA_E", "AMG_N"]), null);
  assert.equal(crsFamilyFromColumns(["MGA94_60_E"]), null);
  assert.equal(crsFamilyFromColumns(["MGA_ZONE"]), null);
  assert.equal(crsFamilyFromColumns(["Hole_ID", "Depth"]), null);
});

test("each zone lands the collars somewhere different: zone 50 puts the review's collars near 33.9 S, 116 E", () => {
  const pts = [{ x: 405000, y: 6252000 }];
  const z50 = collarCentreLonLat(pts, 28350), z51 = collarCentreLonLat(pts, 28351);
  assert.ok(Math.abs(z50.lat + 33.87) < 0.1 && Math.abs(z50.lon - 115.97) < 0.2, JSON.stringify(z50));
  assert.ok(Math.abs(z51.lon - z50.lon - 6) < 0.01); // one zone east: 6 degrees
});

test("the import passes the mapped columns' family to the CRS dialog, which lists its zones", () => {
  const u = readFileSync(new URL("../src/modules/viewer/importPipelineImpl.js", import.meta.url), "utf8");
  assert.match(u, /const family = crsFamilyFromColumns\(\[xc, yc\]\.filter\(Boolean\)\);/);
  assert.match(u, /const zones = !named && family && !frame\?\.local && !small \? family : null;/);
  assert.match(u, /pts, named, \{ family: zones \}\);/);
  const r = readFileSync(new URL("../src/lib/projectCrsRequest.js", import.meta.url), "utf8");
  assert.match(r, /family: opts\.family \|\| null/);
  const a = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(a, /family=\{crsRequest\.family \|\| null\}/);
  const m = readFileSync(new URL("../src/components/ProjectCrsModal.jsx", import.meta.url), "utf8");
  assert.match(m, /familyZones\.map\(\(c\) => option\(c, c\.landing \? tr\("— collars at \{where\}"/);
  assert.match(m, /The file cannot tell \{a\} from \{b\}: choose the datum the coordinates were surveyed in\./);
});
