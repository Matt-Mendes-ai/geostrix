// TASKS.csv #2291 (review #2174, WA gold) — Maps > Project CRS gives the same landing check as the status-bar dialog
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { collarCentreLonLat } from "../src/lib/projectCrs.js";
import { smallGridCoordinates } from "../src/lib/crsFromColumns.js";
test("#2291 the review's case: local-grid collars in MGA 51 land near the South Pole, and their eastings say local grid", () => {
  const cols = [{ x: 31950, y: 807798 }, { x: 32315, y: 808239 }, { x: 32100, y: 808000 }];
  const at = collarCentreLonLat(cols, 28351);
  assert.ok(at && at.lat < -75, JSON.stringify(at));
  assert.ok(smallGridCoordinates(cols));
  const c = readFileSync(new URL("../src/modules/CartographyModule.jsx", import.meta.url), "utf8");
  assert.match(c, /const cols = store\.collars, at = collarCentreLonLat\(cols, newCrs\), spread = at \? collarSpread\(cols, newCrs\) : null, small = smallGridCoordinates\(cols\);/);
  assert.match(c, /That is near a pole/);
});
