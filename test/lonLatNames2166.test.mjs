// TASKS.csv #2166 (WA drillhole review) — the WAMEX longitude / latitude spellings, with the datum their names give
import test from "node:test";
import assert from "node:assert/strict";
import { lonLatColumns, lonLatForCollars } from "../src/lib/projectCrs.js";
import { getProj4DefSync, reprojectXY } from "../src/lib/reproject.js";

const rows = [{ a: 121.51, b: -27.2 }, { a: 121.52, b: -27.21 }];
const as = (x, y) => rows.map((r) => ({ [x]: r.a, [y]: r.b }));

test("ll_long / lllatitude / long_gda / lat_gda / lllongitude are read, each with its datum", () => {
  assert.deepEqual(lonLatColumns(["ll_long", "ll_lat"], as("ll_long", "ll_lat")), { x: "ll_long", y: "ll_lat", epsg: 4326 });
  assert.deepEqual(lonLatColumns(["lllongitude", "lllatitude"], as("lllongitude", "lllatitude")), { x: "lllongitude", y: "lllatitude", epsg: 4326 });
  assert.deepEqual(lonLatColumns(["LONG_GDA", "LAT_GDA"], as("LONG_GDA", "LAT_GDA")), { x: "LONG_GDA", y: "LAT_GDA", epsg: 4283 });
  assert.deepEqual(lonLatColumns(["Long_GDA2020", "Lat_GDA2020"], as("Long_GDA2020", "Lat_GDA2020")), { x: "Long_GDA2020", y: "Lat_GDA2020", epsg: 7844 });
  assert.equal(lonLatForCollars("collars", {}, ["Hole", "LONG_GDA", "LAT_GDA"], as("LONG_GDA", "LAT_GDA")).sourceEpsg, "4283");
});

test("GeoStrix can reproject from both GDA datums", () => {
  assert.ok(getProj4DefSync(4283) && getProj4DefSync(7844));
  const p = reprojectXY(121.5, -27.2, 4283, 28351);
  assert.ok(p && p.x > 340000 && p.x < 360000 && p.y > 6.98e6 && p.y < 7.0e6, JSON.stringify(p));
});
