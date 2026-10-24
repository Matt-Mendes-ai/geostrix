// TASKS.csv #837 — the satellite-image fetch keeps the Copernicus Sentinel-2 scene path only (the EOX mosaic is a
// display-only basemap, CC BY-NC-SA): the resolution levels and the pre-fetch plan for an area
import test from "node:test";
import assert from "node:assert/strict";
import { SAT_LEVELS, NATIVE_M, planLatestFetch } from "../src/lib/imageryLevels.js";
import { getBaseLayer } from "../src/lib/baseLayers.js";

test("#837 three levels, each keeping a longer side than the last", () => {
  const g = Object.values(SAT_LEVELS).map((l) => l.gridMax);
  assert.deepEqual(g, [1024, 2048, 3072]);
  assert.equal(NATIVE_M, 10);
});

test("#837 a 2 km area is at the imagery's own 10 m at every level", () => {
  // ~2 km x 2 km at 52 N (Woodjam): 0.0293 degrees of longitude, 0.018 of latitude
  const box = [-121.33, 52.29, -121.3007, 52.308];
  for (const level of Object.keys(SAT_LEVELS)) {
    const p = planLatestFetch(box, level);
    assert.equal(p.pixelM, 10, level);
    assert.ok(p.nativeLimited);
    assert.ok(p.gridW >= 190 && p.gridW <= 210 && p.gridH >= 190 && p.gridH <= 210, `${level}: ${p.gridW} x ${p.gridH}`);
  }
});

test("#837 a 60 km area is coarser at Standard than at Very high, within the level's longest side", () => {
  const box = [-121.8, 52.0, -120.92, 52.54]; // ~60 km x 60 km at 52 N
  const s = planLatestFetch(box, "standard"), v = planLatestFetch(box, "veryhigh");
  assert.ok(!s.nativeLimited && !v.nativeLimited);
  assert.ok(s.pixelM > 55 && s.pixelM < 62, String(s.pixelM));
  assert.ok(v.pixelM > 18 && v.pixelM < 21, String(v.pixelM));
  assert.ok(Math.max(s.gridW, s.gridH) <= 1024 && Math.max(v.gridW, v.gridH) <= 3072);
  assert.equal(planLatestFetch(box, "nonsense").level, "standard");
});

test("#837 the Satellite basemap states EOX's real licence", () => {
  const sat = getBaseLayer("satellite");
  assert.match(sat.attribution, /CC BY-NC-SA 4\.0/);
  assert.match(sat.attribution, /non-commercial/);
  assert.match(sat.tileUrl(10, 1, 2), /s2cloudless-2025_3857\/default\/g\/10\/2\/1\.jpg$/);
});
