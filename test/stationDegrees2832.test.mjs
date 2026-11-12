// TASKS.csv #2832 (GSC geophysics review B2) — longitude / latitude stations whose columns are called X and Y (Geosoft) went into a UTM
// project as metres. The file's Geosoft header is read, and X / Y that can only be degrees in a projected project are read as WGS 84 and said.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { geosoftHeaderEpsg, xyLookLikeDegrees } from "../src/lib/stationDegrees.js";

test("a Geosoft header names the CRS", () => {
  assert.equal(geosoftHeaderEpsg('/ ----\r\n/ Projection:"WGS 84"\r\n/ Unit:dega,1\r\nX,Y,BOUGUER\r\n-79.5,48.1,-25'), 4326);
  assert.equal(geosoftHeaderEpsg('/ Projection:"NAD83"\n/ Unit:dega\nX,Y,G'), 4269);
  assert.equal(geosoftHeaderEpsg('/ Projection:"NAD27"\nX,Y'), 4267); // a datum alone is geographic
  assert.equal(geosoftHeaderEpsg('/ Projection:"NAD83 / UTM zone 17N"\n/ Unit:m\nX,Y'), 26917);
  assert.equal(geosoftHeaderEpsg('/ Projection:"WGS 84 / UTM zone 20S"\nX,Y'), 32720);
  assert.equal(geosoftHeaderEpsg('/ Projection:"NAD83 / BC Albers"\n/ Unit:m\nX,Y'), null); // not told by name: left to the user
  assert.equal(geosoftHeaderEpsg('X,Y,G\n1,2,3'), null);
  assert.equal(geosoftHeaderEpsg('/ 17T\n/ datum NAD83'), null); // a GEM header is gemHeaderEpsg's (#1329)
});

test("X / Y that can only be degrees", () => {
  const blake = Array.from({ length: 50 }, (_, i) => ({ X: (-79.548102 + i * 0.025).toFixed(6), Y: (48.062673 + i * 0.009).toFixed(6), BOUGUER: -20 - i }));
  assert.equal(xyLookLikeDegrees(blake, "X", "Y"), true);
  assert.equal(xyLookLikeDegrees(blake.map((r) => ({ ...r, X: 600000 + Number(r.X) })), "X", "Y"), false); // metres
  assert.equal(xyLookLikeDegrees([{ X: 1, Y: 2 }, { X: 2, Y: 3 }, { X: 3, Y: 4 }, { X: 4, Y: 5 }], "X", "Y"), false); // a small local grid of integers
  assert.equal(xyLookLikeDegrees(blake.slice(0, 2), "X", "Y"), false); // too few to tell
  assert.equal(xyLookLikeDegrees(blake, "X", ""), false);
});

test("both import routes use them, and say so", () => {
  const g = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");
  // the CSV route
  assert.match(g, /const hdrEpsg = !mineSrc && !geophysSourceEpsg && !cols\.geographic \? geosoftHeaderEpsg\(head\) : null;/);
  assert.match(g, /const srcEpsg = mineSrc \? "" : geophysSourceEpsg \|\| \(cols\.geographic \? "4326" : ""\) \|\| \(hdrEpsg \? String\(hdrEpsg\) : ""\) \|\| \(asDegrees \? "4326" : ""\);/);
  // the picker: header read, warned before Import, read as WGS 84 at Import, notes appended (not overwritten)
  assert.match(g, /headerEpsg: gemHeaderEpsg\(text\) \|\| geosoftHeaderEpsg\(text\)/);
  assert.match(g, /setXyzPending\(\{ headerEpsg: geosoftHeaderEpsg\(head\) \/\* #2832 \*\/, \.\.\.extra,/);
  assert.match(g, /\|\| \(pickerDegrees \? 4326 : null\) \|\| null;/);
  assert.match(g, /tr\("\{x\} and \{y\} are all within ±180 \/ ±90: longitude and latitude, not metres\./);
  assert.match(g, /reprojectNote \+= failed \/\/ \+= \(#2832\)/);
});
