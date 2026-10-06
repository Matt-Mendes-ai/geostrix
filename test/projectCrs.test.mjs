// TASKS.csv #615 — choosing the project CRS anywhere on Earth; crsSet on new / loaded projects.
import test from "node:test";
import assert from "node:assert/strict";
import { crsCandidatesAt, utmZoneOf, parseLatLon, collarCentreLonLat } from "../src/lib/projectCrs.js";
import { FIELDS } from "../src/lib/projectFields.js";

test("#615 candidates for a place: its UTM zone and hemisphere, regional datum first", () => {
  assert.equal(utmZoneOf(-121.35), 10);
  assert.equal(utmZoneOf(179.9), 60);
  assert.equal(utmZoneOf(-180), 1);
  const top = (lat, lon) => crsCandidatesAt(lon, lat)[0]?.code;
  assert.equal(top(52.25, -121.35), 3157); // BC: NAD83(CSRS) / UTM 10N
  assert.equal(top(40, -117), 26911); // Nevada: NAD83 / UTM 11N
  assert.equal(top(-14, -72), 31979); // Peru: SIRGAS 2000 / UTM 19S
  assert.equal(top(-30, 121), 7851); // Western Australia: GDA2020 / MGA 51
  assert.equal(top(67, 26), 25835); // Finland: ETRS89 / UTM 35N
  assert.equal(top(6, -2), 32630); // Ghana: WGS 84 / UTM 30N
  assert.equal(top(-41, 172), 2193); // New Zealand: NZTM2000
  assert.ok(crsCandidatesAt(-121.35, 52.25).some((c) => c.code === 3005)); // BC Albers offered in BC
  assert.ok(crsCandidatesAt(-72, -14).every((c) => !/\d+N\b/.test(c.name))); // southern hemisphere only
  assert.deepEqual(crsCandidatesAt(0, 89), []); // polar: no UTM
});

test("#615 lat/long typed the way people write it", () => {
  assert.deepEqual(parseLatLon("52.2, -121.3"), { lat: 52.2, lon: -121.3 });
  assert.deepEqual(parseLatLon("52,2 N 121,3 W"), { lat: 52.2, lon: -121.3 });
  assert.deepEqual(parseLatLon("23.5S 46.6W"), { lat: -23.5, lon: -46.6 });
  assert.equal(parseLatLon("95, 10"), null);
  assert.equal(parseLatLon("Horsefly"), null);
});

test("#615 where collars would land: a wrong zone is ~6 degrees of longitude away", () => {
  const c = [{ x: 612555, y: 5787668 }];
  const z10 = collarCentreLonLat(c, 3157), z9 = collarCentreLonLat(c, 3156);
  assert.ok(Math.abs(z10.lon - -121.35) < 0.05 && Math.abs(z10.lat - 52.23) < 0.05);
  assert.ok(Math.abs(z9.lon - z10.lon - -6) < 0.01);
  assert.equal(collarCentreLonLat([], 3157), null);
});

test("#615 crsSet: new projects unset; old files count as chosen unless they hold the old silent default", () => {
  const f = FIELDS.find((x) => x.key === "project");
  assert.equal(f.empty().crsSet, false);
  assert.equal(f.load({ project: { epsg: 3157 } }).crsSet, true);
  assert.equal(f.load({ project: { epsg: 3156 } }).crsSet, false);
  assert.equal(f.load({ project: { epsg: 3156, crsSet: true } }).crsSet, true);
  assert.equal(f.load({}).crsSet, false);
});
