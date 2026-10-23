// TASKS.csv #834 — the full EPSG registry: its shape, the hand-verified codes keeping priority, codes outside the old
// table resolving once it is loaded, against PROJ 9.8.1 (pyproj 3.8.0, EPSG v12.029) reference points within the
// accuracy EPSG states for each datum shift, names in the CRS list, and datum notes for approximate shifts
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import proj4 from "proj4";
import { getProj4DefSync, getProj4Def, installEpsgRegistry, epsgRegistryLoaded, listSupportedCrs, crsName, datumNote, pointTransform } from "../src/lib/reproject.js";

const reg = JSON.parse(fs.readFileSync(new URL("../src/lib/epsgRegistry.json", import.meta.url), "utf8"));
const WGS84 = "+proj=longlat +datum=WGS84 +no_defs";

test("#834 the registry file: EPSG version, size, entry shape", () => {
  assert.equal(reg.epsg, "v12.029");
  assert.ok(reg.count >= 5800 && Object.keys(reg.codes).length === reg.count, String(reg.count));
  for (const [code, e] of Object.entries(reg.codes).slice(0, 500)) {
    assert.ok(/^\d+$/.test(code) && typeof e[0] === "string" && e[1].startsWith("+proj=") && (e[2] === null || typeof e[2] === "number") && Number.isInteger(e[3]), code);
  }
});

test("#834 before loading: only the hand-verified codes; after: the registry, the hand-verified ones keeping priority", async () => {
  if (!epsgRegistryLoaded()) assert.equal(getProj4DefSync(27700), null, "British National Grid was not in the old table");
  const hand3156 = getProj4DefSync(3156);
  installEpsgRegistry(reg);
  assert.ok(epsgRegistryLoaded());
  assert.equal(getProj4DefSync(3156), hand3156, "NAD83(CSRS) UTM 9N keeps its hand-verified definition");
  assert.match(getProj4DefSync(27700), /\+proj=tmerc .*\+towgs84=446\.448,-125\.157,542\.06/);
  assert.ok(await getProj4Def(32198));
  assert.equal(getProj4DefSync(999999), null);
});

test("#834 registry codes agree with PROJ within the stated accuracy of their datum shift", () => {
  installEpsgRegistry(reg);
  // [code, lon, lat, PROJ x, y (best transformation at that point)]
  const ref = [[27700, -1.5, 53.0, 433653.297, 344858.883], [32198, -71.2, 46.8, -205749.442, 315495.61], [3401, -114.0, 51.0, 70140.783, 5648039.762],
    [20935, 28.3, -15.4, 639506.155, 8297299.654], [26331, 3.4, 6.5, 544314.317, 718374.081], [31370, 4.4, 50.8, 152202.884, 165505.136], [2056, 7.4, 46.9, 2597056.203, 1194321.876]];
  for (const [code, lon, lat, x, y] of ref) {
    const [, def, acc] = reg.codes[code];
    const [px, py] = proj4(WGS84, def, [lon, lat]);
    const d = Math.hypot(px - x, py - y);
    // PROJ may pick a more local shift at that point (Minna: another of EPSG's Nigerian shifts, 12 m away): two estimates each
    // good to `acc` can differ by up to twice it. Against the SAME operation the verify step holds every code to 10 cm.
    assert.ok(d <= 2 * Math.max(0.5, acc) + 0.5, `${code}: ${d.toFixed(2)} m from PROJ (stated accuracy ${acc} m)`);
  }
  const T = pointTransform(4326, 32198);
  const [qx, qy] = T(-71.2, 46.8);
  assert.ok(Math.hypot(qx + 205749.442, qy - 315495.61) < 0.5, "pointTransform uses it");
});

test("#834 names in the CRS list and datum notes for approximate or unpublished shifts", () => {
  installEpsgRegistry(reg);
  const all = listSupportedCrs();
  assert.ok(all.length > 5800);
  assert.equal(crsName(32198), "NAD83 / Quebec Lambert");
  assert.equal(crsName(3401), "NAD83 / Alberta 10-TM (Resource)");
  assert.equal(all.filter((c) => c.code === 3156).length, 1, "a hand-verified code listed once");
  assert.equal(crsName(3156), "NAD83(CSRS) / UTM zone 9N");
  assert.match(datumNote(20935), /accurate to about 44 m/);
  const noShift = Object.entries(reg.codes).find(([c, e]) => e[2] === null && e[0].startsWith("CGCS2000 / 3-degree"))[0];
  assert.match(datumNote(noShift), /publishes no datum shift/);
  assert.equal(datumNote(32198), reg.codes[32198][3] & 1 ? datumNote(32198) : null);
  assert.match(datumNote(4267), /NAD27/, "hand-verified notes unchanged");
});
