// TASKS.csv #3208 — a 245,066-point IP .xyz: thinning offered when read whole, the one column left preselected as Value, AppMx read as IP
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { onlyValueLeft } from "../src/lib/geosoft.js";
import { guessSurveyMethod } from "../src/lib/geophysSurveys.js";

test("#3208 the one usable column the coordinates leave is the Value", () => {
  const rows = Array.from({ length: 50 }, (_, i) => ({ X: i, Y: i, Z: 100, AppMx: i * 0.3, _line: 1 }));
  assert.equal(onlyValueLeft(["X", "Y", "Z", "AppMx"], ["X", "Y", "Z"], rows), "AppMx");
  assert.equal(onlyValueLeft(["X", "Y", "Z", "A", "B"], ["X", "Y", "Z"], rows.map((r) => ({ ...r, A: 1, B: 2 }))), ""); // two left: not guessed
  assert.equal(onlyValueLeft(["X", "Y", "Line", "AppMx"], ["X", "Y"], rows.map((r) => ({ ...r, Line: 3 }))), "AppMx"); // a line column is not a value
});

test("#3208 apparent chargeability names read as IP (mV/V); a bare M or a depth is not", () => {
  for (const h of ["AppMx", "Mx", "App_Mx", "APPM"]) assert.equal(guessSurveyMethod(h), "ip", h);
  assert.equal(guessSurveyMethod("M"), null);
  assert.equal(guessSurveyMethod("Max_depth"), null);
});

test("#3208 wiring: thinning offered for a file read whole over 100,000 readings, applied at Import and said", () => {
  const g = fs.readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");
  assert.match(g, /const THIN_FROM_ROWS = 100000;/);
  assert.match(g, /\.\.\.\(parsedRows\.length > THIN_FROM_ROWS \? \{ thin: \{ total: parsedRows\.length, keepEvery: suggestKeepEvery\(parsedRows\.length, undefined, \(layers\.geophys_pts \|\| \[\]\)\.length\) \} \} : \{\}\)/);
  assert.match(g, /const parsedRows = Array\.isArray\(streamedRows\) \? streamedRows : everyNth\(xyzPending\.rows, thinBy\);/);
  assert.match(g, /valueCol: g\.value \|\| onlyValueLeft\(columns, \[gx, gy, g\.z\]\.filter\(Boolean\), parsedRows\)/);
});
