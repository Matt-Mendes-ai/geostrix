// TASKS.csv #614 — wrong-UTM-zone detection: neighbouring zones of the same family, collar-vs-ground misfit.
import test from "node:test";
import assert from "node:assert/strict";
import { neighbourUtmZones } from "../src/lib/reproject.js";
import { collarGroundMisfit } from "../src/lib/srtmFetch.js";

test("#614 neighbourUtmZones keeps the datum family and hemisphere", () => {
  assert.deepEqual(neighbourUtmZones(3156).map((c) => c.code), [3155, 3157]); // NAD83(CSRS) 9N -> 8N, 10N
  assert.deepEqual(neighbourUtmZones(26910).map((c) => c.code), [26909, 26911]); // NAD83 10N (not SIRGAS 2000 11N)
  assert.deepEqual(neighbourUtmZones(32610).map((c) => c.code), [32609, 32611]);
  assert.deepEqual(neighbourUtmZones(3005), []); // BC Albers is not UTM
  assert.deepEqual(neighbourUtmZones(4326), []);
});

test("#614 collarGroundMisfit: median |collar Z - ground|, needs 3 collars inside the grid", () => {
  const terrain = { bbox: [0, 0, 100, 100], gridW: 2, gridH: 2, elevations: [0, 0, 0, 0] };
  const c = (z, x = 50) => ({ hole_id: "H" + z, x, y: 50, z });
  assert.equal(collarGroundMisfit([c(950), c(960), c(970)], terrain).medianDz, 960);
  assert.equal(collarGroundMisfit([c(950), c(960), c(970, 500)], terrain), null); // one outside the DEM
});
