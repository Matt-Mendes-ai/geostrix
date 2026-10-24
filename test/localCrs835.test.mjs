// TASKS.csv #835 — CRS suggestions for the project location from the whole EPSG registry: every entry has its area of
// use, UTM suggestions drop zones on far-away datums once the registry is loaded, and the provincial / state / local
// grids for the place are found (most local first, no-shift ones last, continental projections left out)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { installEpsgRegistry, registryInfo, crsAreaOf } from "../src/lib/reproject.js";
import { crsCandidatesAt, localCrsAt, inArea } from "../src/lib/projectCrs.js";

const reg = JSON.parse(fs.readFileSync(new URL("../src/lib/epsgRegistry.json", import.meta.url), "utf8"));

test("#835 every registry entry has an area of use [w, s, e, n]", () => {
  for (const [code, e] of Object.entries(reg.codes)) {
    const a = e[4];
    assert.ok(Array.isArray(a) && a.length === 4 && a.every(Number.isFinite) && a[1] <= a[3], code);
  }
  assert.deepEqual(reg.codes[32198][4], [-79.9, 44.9, -57.1, 62.7]);
});

test("#835 inArea: plain boxes, 180-degree crossings, slack", () => {
  assert.ok(inArea([-80, 45, -57, 63], -71.2, 46.8));
  assert.ok(!inArea([-80, 45, -57, 63], -122, 52));
  assert.ok(inArea([166, -48, -176, -33], 179.5, -40) && inArea([166, -48, -176, -33], -177, -40), "crosses 180");
  assert.ok(!inArea([166, -48, -176, -33], 160, -40));
  assert.ok(!inArea([0, 0, 10, 10], 10.5, 5) && inArea([0, 0, 10, 10], 10.5, 5, 1));
  assert.ok(inArea(null, 1, 2), "no area known: kept");
});

test("#835 UTM suggestions keep only CRSs whose area reaches the place", () => {
  installEpsgRegistry(reg);
  assert.ok(registryInfo(3156) === null && crsAreaOf(3156), "hand-verified codes still get the registry's area");
  const quebec = crsCandidatesAt(-71.2, 46.8).map((c) => c.code);
  assert.equal(quebec[0], 2960, "NAD83(CSRS) / UTM 19N first");
  for (const far of [3179, 24719, 29169, 31973]) assert.ok(!quebec.includes(far), `${far} is not used in Quebec`);
  const zambia = crsCandidatesAt(28.3, -15.4).map((c) => c.code);
  assert.ok(zambia.includes(20935) && zambia.includes(32735));
});

test("#835 local grids for the place: most local first, continental projections out", () => {
  installEpsgRegistry(reg);
  const near = (lon, lat) => localCrsAt(lon, lat, { exclude: crsCandidatesAt(lon, lat).map((c) => c.code) });
  const qc = near(-71.2, 46.8).map((c) => c.code);
  assert.ok(qc.includes(32198) && qc.includes(2949), "Quebec Lambert and MTM zone 7");
  assert.ok(qc.indexOf(2949) < qc.indexOf(32198), "MTM (a zone) before the province-wide Lambert");
  assert.ok(!qc.includes(3978), "Canada Atlas Lambert (continental) left out");
  assert.ok(near(-1.5, 53).some((c) => c.code === 27700), "British National Grid");
  assert.ok(near(-105, 39.7).some((c) => c.code === 26953), "Colorado North State Plane");
  assert.ok(near(-114, 51).some((c) => c.code === 3401), "Alberta 10-TM");
  const uk = near(-1.5, 53);
  assert.ok(uk.findIndex((c) => c.noShift) > uk.findIndex((c) => c.code === 27700), "no-shift engineering grids after the national grid");
  assert.ok(!near(-122.1, 52.1).some((c) => c.code === 3005), "BC Albers already in the first list is not repeated");
  assert.deepEqual(near(28.3, -15.4), []);
});
