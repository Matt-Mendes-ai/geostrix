// TASKS.csv #3450 (Matt, v0.1.117, NW BC at 56.35 N, 130.25 W, EPSG:3156: "also only standard resolution available for imagery") — the default
// source there is Sentinel-2 (NAIP is USA only); up to ~10 km across, Standard already fetches its own 10 m pixels, so the higher levels were
// greyed out with no word why. The picker now says so, and what gives finer detail.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { levelsAtNative, levelsAddingNothing, planLatestFetch } from "../src/lib/imageryLevels.js";

const box = (km, lon = -130.25, lat = 56.35) => { const dLon = km / 2 / (111.32 * Math.cos((lat * Math.PI) / 180)), dLat = km / 2 / 110.574; return [lon - dLon, lat - dLat, lon + dLon, lat + dLat]; };

test("Matt's case: an area up to ~10 km at 56.35 N is at Sentinel-2's 10 m from Standard; the higher levels add nothing", () => {
  for (const km of [3, 8, 10]) {
    assert.deepEqual([...levelsAddingNothing(box(km))].sort(), ["full", "high", "veryhigh"]);
    assert.equal(planLatestFetch(box(km), "standard").pixelM, 10);
    assert.deepEqual(levelsAtNative(box(km)), { reached: "standard", nativeM: 10, levels: ["high", "veryhigh", "full"] });
  }
});

test("a larger area: the lowest level already at 10 m is named; at 44 km every level differs and nothing is said", () => {
  assert.equal(levelsAtNative(box(15)).reached, "high"); // Standard 14.6 m, High 10 m
  assert.equal(levelsAtNative(box(25)).reached, "veryhigh");
  assert.equal(levelsAtNative(box(44)), null);
});

test("the picker says why, names the level, and what gives finer detail", () => {
  const m = readFileSync(new URL("../src/modules/RasterModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(m, /const n = levelsAtNative\(bbox, naip \? NAIP_FINEST_M : undefined\);/);
  assert.match(m, /tr\("Sentinel-2's pixels are 10 m, and \{level\} already fetches them for an area this size\. For finer detail, import an orthophoto as a GeoTIFF \(Maps > GeoTIFF \/ GXF\)\.", \{ level \}\)/);
});
