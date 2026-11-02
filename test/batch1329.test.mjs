import test from "node:test";
import assert from "node:assert/strict";
import { gemHeaderEpsg, suggestKeepEvery, everyNth, batchSurveyName, pairGpsFile } from "../src/lib/xyzBatch.js";
import { crsMapArea, areaRects, areaText, WORLD_OUTLINE } from "../src/lib/crsMapArea.js";

test("#1329 a GEM header states the CRS", () => {
  const head = (zone, datum) => `/Gem Systems GSM-19WV\n/UTC-07:00\n/${zone}\n/GPS datum ${datum} \n/X Y elev rawmag\n 0611053.36 6356328.88 1391 56892.45\n`;
  assert.equal(gemHeaderEpsg(head("09V", "WGS84")), 32609);
  assert.equal(gemHeaderEpsg(head("19H", "WGS84")), 32719, "band below N is south");
  assert.equal(gemHeaderEpsg(head("10U", "NAD83")), 26910);
  assert.equal(gemHeaderEpsg(head("10U", "ED50")), null);
  assert.equal(gemHeaderEpsg("/X Y MAG\n1 2 3\n"), null);
});
test("#1329 thinning: the lightest that fits, and what it keeps", () => {
  assert.equal(suggestKeepEvery(50000), 1);
  assert.equal(suggestKeepEvery(180000), 2);
  assert.equal(suggestKeepEvery(577220), 10);
  assert.equal(suggestKeepEvery(9e7), 50);
  assert.deepEqual(everyNth([0, 1, 2, 3, 4, 5], 2), [0, 2, 4]);
  const a = [1, 2]; assert.equal(everyNth(a, 1), a);
});
test("#1329 a name for many files; a GPS file for a survey", () => {
  assert.equal(batchSurveyName(["20220625_RedBlue_WalkMAG.xyz", "20220701_Red_WalkMAG.xyz"]), "WalkMAG (2 files)");
  assert.equal(batchSurveyName(["Lawyers_a.xyz", "Lawyers_bcd.xyz"]), "Lawyers (2 files)");
  assert.equal(batchSurveyName(["a.xyz", "b.xyz"]), "Survey (2 files)");
  const gps = ["BoundaryGPS.txt", "MistyGPS.txt", "SlideGPS.txt", "AllGPS.txt"];
  assert.equal(pairGpsFile("BoundMag.xyz", gps), "BoundaryGPS.txt");
  assert.equal(pairGpsFile("MistyMag.xyz", gps), "MistyGPS.txt");
  assert.equal(pairGpsFile("SlideMag.xyz", gps), "SlideGPS.txt");
  assert.equal(pairGpsFile("Other.xyz", gps), null);
  assert.equal(pairGpsFile("Line1.xyz", ["Line1A.txt", "Line1B.txt"]), null, "two equally good: neither");
});
test("#1330 where a CRS applies", () => {
  assert.deepEqual(crsMapArea([-126, 48, -120, 60], "x"), [-126, 48, -120, 60]);
  assert.deepEqual(crsMapArea(null, "WGS 84 / UTM zone 10N"), [-126, 0, -120, 84]);
  assert.deepEqual(crsMapArea(null, "WGS 84 / UTM zone 22S"), [-54, -80, -48, 0]);
  assert.deepEqual(crsMapArea(null, "NAD83 / UTM zone 9N"), [-132, 0, -126, 84]);
  assert.deepEqual(crsMapArea(null, "WGS 84 (longitude / latitude)"), [-180, -90, 180, 90]);
  assert.equal(crsMapArea(null, "Some local grid"), null);
  assert.deepEqual(areaRects([-126, 48, -120, 60]), [{ x: 54, y: 30, w: 6, h: 12 }]);
  const cross = areaRects([170, -50, -170, -30]);
  assert.equal(cross.length, 2);
  assert.deepEqual(cross.map((r) => r.w), [10, 10]);
  assert.equal(cross[1].x, 0);
  assert.match(areaText([-126, 48, -120, 60]), /126°W to 120°W, 48°N to 60°N/);
});
test("#1330 the outline stays on the map", () => {
  for (const ring of WORLD_OUTLINE) for (const [lon, lat] of ring) assert.ok(Math.abs(lon) <= 180 && Math.abs(lat) <= 90, `${lon},${lat}`);
});
