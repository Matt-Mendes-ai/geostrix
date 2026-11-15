// TASKS.csv #3187 (Matt's pick B) — an export through a local-grid tie says which attribute columns look like bearings and were not turned
import test from "node:test";
import assert from "node:assert/strict";
import { bearingAttributeNote } from "../src/lib/tiedExport.js";
const tie = { epsg: 28350, rotationDeg: 12.5 };
const f = (attributes) => ({ geometry: [[0, 0]], attributes });
test("names the bearing-like columns, once each; nothing without a tie or such a column", () => {
  const n = bearingAttributeNote([f({ id: 1, DipDir: 140, dip: 60 }), f({ id: 2, DipDir: 90, Azimuth_deg: 30, strike: 10 })], tie);
  assert.match(n, /^ Column\(s\) DipDir, Azimuth_deg, strike look like bearings: they were written as they are, measured from the local grid's north, not turned by the tie's rotation \(12\.5°\)\.$/);
  assert.equal(bearingAttributeNote([f({ id: 1, dip: 60 })], tie), "");
  assert.equal(bearingAttributeNote([f({ DipDir: 1 })], null), "");
  assert.equal(bearingAttributeNote(null, tie), "");
});
