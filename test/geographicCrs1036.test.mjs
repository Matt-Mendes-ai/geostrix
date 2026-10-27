// TASKS.csv #1036 (review #1016) — "Reproject a file" decides degrees vs metres from the CRS definition, not its name.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { isGeographicCrs, installEpsgRegistry, crsName, pointTransform } from "../src/lib/reproject.js";

const reg = JSON.parse(fs.readFileSync(new URL("../src/lib/epsgRegistry.json", import.meta.url), "utf8"));

test("#1036 registry geographic datums (NAD83(2011), ED50, TWD97) are geographic; projected ones are not", () => {
  installEpsgRegistry(reg);
  for (const c of [4326, 4269, 6318, 4230, 3824]) assert.ok(isGeographicCrs(c), `${c} ${crsName(c)}`);
  assert.doesNotMatch(crsName(6318) || "", /longitude/); // the name check this replaces said "projected"
  for (const c of [26910, 3156, 32610, 27700, 3005]) assert.ok(!isGeographicCrs(c), String(c));
  assert.ok(!isGeographicCrs(999999) && !isGeographicCrs("x"));
  // 3 decimals of a degree is up to ~111 m; the app now keeps 8 (about 1 mm)
  const T = pointTransform(26910, 6318);
  const [lon, lat] = T(600000, 5800000);
  const geo = isGeographicCrs(6318);
  const kept = [+lon.toFixed(geo ? 8 : 3), +lat.toFixed(geo ? 8 : 3)];
  assert.ok(Math.abs(kept[1] - lat) * 111000 < 0.01 && Math.abs(kept[0] - lon) * 111000 < 0.01);
});
