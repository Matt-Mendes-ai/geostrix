// TASKS.csv #2833 (GSC geophysics review B3) — on an empty project whose CRS was just chosen (NAD83 / UTM 18N), longitude / latitude stations
// offered to make the PROJECT CRS geographic (EPSG:4269) and OK did it. A geographic CRS is never offered without a place (#1148), and a
// chosen CRS is never offered for replacement by the station importer.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { askAdoptCrs, medianLonLat } from "../src/lib/adoptCrs.js";

const say = [];
const yes = (m) => { say.push(m); return true; };

test("degrees are never offered as the project CRS; with a place, that place's metric CRS is", () => {
  say.length = 0;
  assert.equal(askAdoptCrs({ isEmpty: true, currentEpsg: 3156, declaredEpsg: 4269, fileName: "m.csv" }, yes), null); // no place: nothing asked
  assert.equal(say.length, 0);
  const d = askAdoptCrs({ isEmpty: true, currentEpsg: 3156, declaredEpsg: 4269, fileName: "m.csv", at: { lon: -77.8, lat: 49.7 } }, yes);
  assert.ok(d && d !== 4269, String(d)); // a UTM zone for Matagami, not 4269
  assert.match(say[0], /latitude and longitude, which cannot be a project CRS/);
});

test("a CRS the user chose is kept: nothing asked", () => {
  say.length = 0;
  assert.equal(askAdoptCrs({ isEmpty: true, currentEpsg: 26918, declaredEpsg: 4269, fileName: "m.csv", at: { lon: -77.8, lat: 49.7 }, crsSet: true }, yes), null);
  assert.equal(askAdoptCrs({ isEmpty: true, currentEpsg: 26918, declaredEpsg: 26917, fileName: "u.csv", crsSet: true }, yes), null);
  assert.equal(say.length, 0);
  // the placeholder (crsSet false): #607 as before for a projected file
  assert.equal(askAdoptCrs({ isEmpty: true, currentEpsg: 3156, declaredEpsg: 26917, fileName: "u.csv" }, yes), 26917);
});

test("the stations' middle in degrees, or null when they are not degrees", () => {
  assert.deepEqual(medianLonLat([{ x: -78.1, y: 49.7 }, { x: -77.9, y: 49.8 }, { x: -77.5, y: 49.65 }]), { lon: -77.9, lat: 49.7 });
  assert.equal(medianLonLat([{ x: 600000, y: 5500000 }]), null);
  assert.equal(medianLonLat([]), null);
});

test("both station routes pass the place and whether the CRS was chosen", () => {
  const g = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");
  assert.equal((g.match(/at: isGeographicCrs\(Number\((srcEpsg|statedEpsg)\)\) \? medianLonLat\(mapped\) : null, crsSet: project\?\.crsSet === true/g) || []).length, 2);
});
