// TASKS.csv #707 — a GeoTIFF with a "user-defined" CRS (32767) named in its citation
import { test } from "node:test";
import assert from "node:assert/strict";
import { epsgFromGeoKeys } from "../src/lib/raster.js";

test("32767 is resolved from the citation; a real code is kept; nothing known -> null", () => {
  assert.equal(epsgFromGeoKeys({ ProjectedCSTypeGeoKey: 32767, PCSCitationGeoKey: "NAD_1983_CSRS_UTM_Zone_10N" }), 3157);
  assert.equal(epsgFromGeoKeys({ ProjectedCSTypeGeoKey: 32767, GTCitationGeoKey: "NAD83 / UTM zone 9N" }), 26909);
  assert.equal(epsgFromGeoKeys({ ProjectedCSTypeGeoKey: 26910 }), 26910);
  assert.equal(epsgFromGeoKeys({ GeographicTypeGeoKey: 4326 }), 4326);
  assert.equal(epsgFromGeoKeys({ ProjectedCSTypeGeoKey: 32767, PCSCitationGeoKey: "Local mine grid" }), null);
  assert.equal(epsgFromGeoKeys({ ProjectedCSTypeGeoKey: 32767 }), null);
  assert.equal(epsgFromGeoKeys(null), null);
});
